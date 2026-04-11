/**
 * resolution-finalize.job.ts
 *
 * Scheduler task: checks for resolved questions whose dispute window has expired.
 * Finalizes them and triggers Brier scoring.
 *
 * Runs periodically (every 1h via scheduler).
 */

import { createWorkerSupabase } from '../../supabase'
import { finalizeResolution, logAudit } from '../../../../../lib/resolution/engine'
import { publishForecastEvent } from '../../../../../lib/forecast/queue/publisher'

export async function runResolutionFinalizeJob(): Promise<void> {
  const supabase = createWorkerSupabase()
  const now = new Date().toISOString()

  // Find questions that are resolved with expired dispute windows
  const { data: questions, error } = await supabase
    .from('forecast_questions')
    .select('id, status, dispute_window_ends')
    .in('status', ['resolved_yes', 'resolved_no'])
    .not('dispute_window_ends', 'is', null)
    .lt('dispute_window_ends', now)
    .limit(50)

  if (error) {
    console.error('[resolution-finalize] Query error:', error.message)
    return
  }

  if (!questions?.length) {
    console.log('[resolution-finalize] No questions ready for finalization.')
    return
  }

  let finalized = 0
  for (const q of questions) {
    // Load the most recent approved job for this question
    const { data: job } = await supabase
      .from('resolution_jobs')
      .select('id, status')
      .eq('question_id', q.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!job) {
      // No job — this question was resolved via the legacy manual route.
      // Clear the dispute window and trigger scoring directly.
      await supabase.from('forecast_questions').update({
        dispute_window_ends: null,
        updated_at: new Date().toISOString(),
      }).eq('id', q.id)

      await publishForecastEvent({
        type: 'forecast.resolution.ready' as any,
        correlationId: q.id,
        payload: {
          questionId: q.id,
          outcome: q.status,
          resolvedBy: null,
        },
        producer: 'worker',
      })

      finalized++
      continue
    }

    // Finalize via engine
    const result = await finalizeResolution(supabase, job.id, q.id)
    if (result.finalized) {
      // Trigger scoring
      await publishForecastEvent({
        type: 'forecast.resolution.ready' as any,
        correlationId: q.id,
        payload: {
          questionId: q.id,
          outcome: result.outcome,
          resolvedBy: null,
        },
        producer: 'worker',
      })
      finalized++
      console.log(`[resolution-finalize] Finalized question ${q.id} (${result.outcome})`)
    }
  }

  if (finalized > 0) {
    console.log(`[resolution-finalize] ${finalized} question(s) finalized and scoring triggered.`)
  }
}
