import { createWorkerSupabase } from '../../supabase'

interface BlendedRecomputePayload {
  questionId: string
  reason: 'user_forecast' | 'ai_forecast' | 'manual'
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function runBlendedRecomputeJob(payload: BlendedRecomputePayload): Promise<void> {
  const supabase = createWorkerSupabase()
  const { questionId } = payload

  // Check question type
  const { data: qRow } = await supabase
    .from('forecast_questions')
    .select('id, question_type, blended_probability')
    .eq('id', questionId)
    .single()

  if (!qRow) {
    console.warn(`[blended-recompute] Question ${questionId} introuvable.`)
    return
  }

  if (qRow.question_type === 'multi_choice') {
    await recomputeMultiChoice(supabase, questionId, qRow.blended_probability, payload.reason)
  } else {
    await recomputeBinary(supabase, questionId, qRow.blended_probability, payload.reason)
  }
}

async function recomputeBinary(
  supabase: ReturnType<typeof createWorkerSupabase>,
  questionId: string,
  previousBlended: number | null,
  reason: string,
) {
  const { data: userForecasts } = await supabase
    .from('forecast_user_forecasts')
    .select('probability')
    .eq('question_id', questionId)
    .eq('is_current', true)

  const crowdProbs = (userForecasts ?? []).map(f => f.probability).sort((a, b) => a - b)
  let crowdProbability: number | null = null
  if (crowdProbs.length > 0) {
    crowdProbability = median(crowdProbs)
  }

  const { data: aiRow } = await supabase
    .from('forecast_ai_forecasts')
    .select('probability')
    .eq('question_id', questionId)
    .eq('is_current', true)
    .maybeSingle()

  const aiProbability = aiRow?.probability ?? null

  let blended: number | null = null
  if (crowdProbability !== null && aiProbability !== null) {
    blended = (crowdProbability + aiProbability) / 2
  } else if (crowdProbability !== null) {
    blended = crowdProbability
  } else if (aiProbability !== null) {
    blended = aiProbability
  }

  const now = new Date().toISOString()

  await supabase
    .from('forecast_questions')
    .update({
      crowd_probability: crowdProbability,
      ai_probability: aiProbability,
      blended_probability: blended,
      forecast_count: crowdProbs.length,
      updated_at: now,
    })
    .eq('id', questionId)

  await supabase.from('forecast_probability_history').insert({
    question_id: questionId,
    crowd_probability: crowdProbability,
    ai_probability: aiProbability,
    blended_probability: blended,
    forecast_count: crowdProbs.length,
    snapshot_at: now,
  })

  if (blended !== null && previousBlended !== null) {
    const shift = Math.abs(blended - previousBlended)
    if (shift >= 0.15) {
      await supabase.from('forecast_signal_feed').insert({
        question_id: questionId,
        signal_type: 'probability_shift',
        title: `Glissement de probabilité : ${Math.round(shift * 100)}pp`,
        summary: `La probabilité blended a varié de ${Math.round(previousBlended * 100)}% à ${Math.round(blended * 100)}%.`,
        data: { previous: previousBlended, current: blended, shift, reason },
        severity: shift >= 0.25 ? 'critical' : 'warning',
      })
    }
  }

  console.log(`[blended-recompute] Binary ${questionId} — crowd=${crowdProbability?.toFixed(3) ?? '—'} ai=${aiProbability?.toFixed(3) ?? '—'} blended=${blended?.toFixed(3) ?? '—'}`)
}

async function recomputeMultiChoice(
  supabase: ReturnType<typeof createWorkerSupabase>,
  questionId: string,
  _previousBlended: number | null,
  _reason: string,
) {
  // Load outcomes
  const { data: outcomes } = await supabase
    .from('forecast_question_outcomes')
    .select('id, ai_probability')
    .eq('question_id', questionId)
    .order('sort_order')

  if (!outcomes?.length) {
    console.warn(`[blended-recompute] Multi-choice ${questionId} — aucun outcome.`)
    return
  }

  // Load all current user votes per outcome
  const { data: votes } = await supabase
    .from('forecast_user_outcome_votes')
    .select('outcome_id, probability')
    .eq('question_id', questionId)
    .eq('is_current', true)

  const votesByOutcome = new Map<string, number[]>()
  for (const v of votes ?? []) {
    const arr = votesByOutcome.get(v.outcome_id) ?? []
    arr.push(v.probability)
    votesByOutcome.set(v.outcome_id, arr)
  }

  const now = new Date().toISOString()
  let totalVoters = 0

  for (const o of outcomes) {
    const userProbs = (votesByOutcome.get(o.id) ?? []).sort((a, b) => a - b)
    const crowdProb = userProbs.length > 0 ? median(userProbs) : null
    const aiProb = o.ai_probability

    let blended: number | null = null
    if (crowdProb !== null && aiProb !== null) {
      blended = (crowdProb + aiProb) / 2
    } else if (crowdProb !== null) {
      blended = crowdProb
    } else if (aiProb !== null) {
      blended = aiProb
    }

    await supabase
      .from('forecast_question_outcomes')
      .update({
        crowd_probability: crowdProb,
        blended_probability: blended,
      })
      .eq('id', o.id)

    totalVoters = Math.max(totalVoters, userProbs.length)
  }

  // Update question-level forecast_count
  await supabase
    .from('forecast_questions')
    .update({ forecast_count: totalVoters, updated_at: now })
    .eq('id', questionId)

  console.log(`[blended-recompute] Multi-choice ${questionId} — ${outcomes.length} outcomes, ${totalVoters} voter(s)`)
}
