import { createWorkerSupabase } from '../../supabase'
import { publishForecastEvent } from '@/lib/forecast/queue/publisher'

interface MarketMovePayload {
  market_id: string
  previous_probability: number | null
  current_probability: number
  delta: number
}

/**
 * Handles a detected market move: looks up linked forecast questions
 * and triggers blended recompute for each one.
 *
 * Also updates market_probability on the forecast_questions row.
 */
export async function runMarketMoveJob(payload: MarketMovePayload): Promise<void> {
  const supabase = createWorkerSupabase()
  const { market_id, current_probability, delta } = payload

  const { data: links } = await supabase
    .from('external_market_question_links')
    .select('question_id')
    .eq('market_id', market_id)
    .eq('status', 'confirmed')

  if (!links?.length) {
    console.log(`[market-move] No linked questions for market ${market_id}, skipping.`)
    return
  }

  for (const link of links) {
    await supabase
      .from('forecast_questions')
      .update({
        market_probability: current_probability,
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.question_id)

    await publishForecastEvent({
      type: 'forecast.blended.recompute.requested',
      correlationId: link.question_id,
      producer: 'worker',
      payload: {
        questionId: link.question_id,
        reason: 'market_move',
      },
    })

    console.log(`[market-move] Triggered blended recompute for question ${link.question_id} (market delta=${(delta * 100).toFixed(1)}pp)`)
  }

  if (delta >= 0.10) {
    for (const link of links) {
      await supabase.from('forecast_signal_feed').insert({
        question_id: link.question_id,
        signal_type: 'market_move',
        title: `Mouvement marché prédictif : ${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}pp`,
        summary: `Probabilité marché passée de ${payload.previous_probability != null ? Math.round(payload.previous_probability * 100) : '?'}% à ${Math.round(current_probability * 100)}%.`,
        data: { market_id, ...payload },
        severity: delta >= 0.20 ? 'critical' : 'warning',
      }).catch(() => { /* ignore */ })
    }
  }
}
