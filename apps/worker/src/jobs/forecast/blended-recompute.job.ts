import { createWorkerSupabase } from '../../supabase'

interface BlendedRecomputePayload {
  questionId: string
  reason: 'user_forecast' | 'ai_forecast' | 'manual' | 'market_move'
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
  const [{ data: userForecasts }, { data: aiRow }, marketProbability] = await Promise.all([
    supabase
      .from('forecast_user_forecasts')
      .select('probability')
      .eq('question_id', questionId)
      .eq('is_current', true),
    supabase
      .from('forecast_ai_forecasts')
      .select('probability')
      .eq('question_id', questionId)
      .eq('is_current', true)
      .maybeSingle(),
    fetchMarketProbability(supabase, questionId),
  ])

  const crowdProbs = (userForecasts ?? []).map(f => f.probability).sort((a, b) => a - b)
  const crowdProbability = crowdProbs.length > 0 ? median(crowdProbs) : null
  const aiProbability = aiRow?.probability ?? null

  const blended = computeThreeWayBlend(aiProbability, crowdProbability, marketProbability)

  const now = new Date().toISOString()

  await supabase
    .from('forecast_questions')
    .update({
      crowd_probability: crowdProbability,
      ai_probability: aiProbability,
      market_probability: marketProbability,
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

  console.log(`[blended-recompute] Binary ${questionId} — crowd=${crowdProbability?.toFixed(3) ?? '—'} ai=${aiProbability?.toFixed(3) ?? '—'} market=${marketProbability?.toFixed(3) ?? '—'} blended=${blended?.toFixed(3) ?? '—'}`)
}

/**
 * Fetches the latest market probability from linked external prediction markets.
 * Returns null if no confirmed link exists.
 */
async function fetchMarketProbability(
  supabase: ReturnType<typeof createWorkerSupabase>,
  questionId: string,
): Promise<number | null> {
  const { data: links } = await supabase
    .from('external_market_question_links')
    .select('market_id')
    .eq('question_id', questionId)
    .eq('status', 'confirmed')
    .limit(3)

  if (!links?.length) return null

  const marketIds = links.map(l => l.market_id)
  const { data: snapshots } = await supabase
    .from('external_market_snapshots')
    .select('market_id, probability, captured_at')
    .in('market_id', marketIds)
    .order('captured_at', { ascending: false })
    .limit(marketIds.length)

  if (!snapshots?.length) return null

  const seen = new Set<string>()
  const latest: number[] = []
  for (const s of snapshots) {
    if (!seen.has(s.market_id)) {
      seen.add(s.market_id)
      if (s.probability != null) latest.push(s.probability)
    }
  }

  return latest.length > 0
    ? latest.reduce((a, b) => a + b, 0) / latest.length
    : null
}

/**
 * Three-way weighted blend: AI (40%), Crowd (35%), Market (25%).
 * Falls back to available sources with proportional weight redistribution.
 */
function computeThreeWayBlend(
  ai: number | null,
  crowd: number | null,
  market: number | null,
): number | null {
  const sources: Array<{ value: number; weight: number }> = []
  if (ai !== null) sources.push({ value: ai, weight: 0.40 })
  if (crowd !== null) sources.push({ value: crowd, weight: 0.35 })
  if (market !== null) sources.push({ value: market, weight: 0.25 })

  if (sources.length === 0) return null

  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0)
  return sources.reduce((sum, s) => sum + s.value * (s.weight / totalWeight), 0)
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
