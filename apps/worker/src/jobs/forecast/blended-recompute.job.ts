import { createWorkerSupabase } from '../../supabase'

interface BlendedRecomputePayload {
  questionId: string
  reason: 'user_forecast' | 'ai_forecast' | 'manual'
}

export async function runBlendedRecomputeJob(payload: BlendedRecomputePayload): Promise<void> {
  const supabase = createWorkerSupabase()
  const { questionId } = payload

  // 1. Current user forecasts (median crowd probability)
  const { data: userForecasts } = await supabase
    .from('forecast_user_forecasts')
    .select('probability')
    .eq('question_id', questionId)
    .eq('is_current', true)

  const crowdProbs = (userForecasts ?? []).map(f => f.probability).sort((a, b) => a - b)
  let crowdProbability: number | null = null
  if (crowdProbs.length > 0) {
    const mid = Math.floor(crowdProbs.length / 2)
    crowdProbability = crowdProbs.length % 2 !== 0
      ? crowdProbs[mid]
      : (crowdProbs[mid - 1] + crowdProbs[mid]) / 2
  }

  // 2. Current AI probability
  const { data: aiRow } = await supabase
    .from('forecast_ai_forecasts')
    .select('probability')
    .eq('question_id', questionId)
    .eq('is_current', true)
    .maybeSingle()

  const aiProbability = aiRow?.probability ?? null

  // 3. Blended: equal-weight average (MVP)
  let blended: number | null = null
  if (crowdProbability !== null && aiProbability !== null) {
    blended = (crowdProbability + aiProbability) / 2
  } else if (crowdProbability !== null) {
    blended = crowdProbability
  } else if (aiProbability !== null) {
    blended = aiProbability
  }

  const now = new Date().toISOString()

  // 4. Load previous blended to detect significant shifts
  const { data: prev } = await supabase
    .from('forecast_questions')
    .select('blended_probability')
    .eq('id', questionId)
    .single()

  const previousBlended = prev?.blended_probability ?? null

  // 5. Update question
  await supabase
    .from('forecast_questions')
    .update({
      crowd_probability:   crowdProbability,
      ai_probability:      aiProbability,
      blended_probability: blended,
      forecast_count:      crowdProbs.length,
      updated_at:          now,
    })
    .eq('id', questionId)

  // 6. Snapshot into history
  await supabase.from('forecast_probability_history').insert({
    question_id:         questionId,
    crowd_probability:   crowdProbability,
    ai_probability:      aiProbability,
    blended_probability: blended,
    forecast_count:      crowdProbs.length,
    snapshot_at:         now,
  })

  // 7. Generate probability_shift signal if shift >= 15%
  if (blended !== null && previousBlended !== null) {
    const shift = Math.abs((blended as number) - previousBlended)
    if (shift >= 0.15) {
      await supabase.from('forecast_signal_feed').insert({
        question_id: questionId,
        signal_type: 'probability_shift',
        title: `Glissement de probabilité : ${Math.round(shift * 100)}pp`,
        summary: `La probabilité blended a varié de ${Math.round(previousBlended * 100)}% à ${Math.round((blended as number) * 100)}%.`,
        data: {
          previous: previousBlended,
          current: blended,
          shift,
          reason: payload.reason,
        },
        severity: shift >= 0.25 ? 'critical' : 'warning',
      })
    }
  }

  console.log(`[blended-recompute] ${questionId} — crowd=${crowdProbability?.toFixed(3) ?? '—'} ai=${aiProbability?.toFixed(3) ?? '—'} blended=${blended?.toFixed(3) ?? '—'}`)
}
