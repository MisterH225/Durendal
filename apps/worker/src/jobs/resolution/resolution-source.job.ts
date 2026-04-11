/**
 * resolution-source.job.ts
 *
 * Consumes `forecast.resolution.job.created` events.
 * Creates the resolution job row, fetches sources, stores evidence,
 * then queues the proposal generation step.
 */

import { createWorkerSupabase } from '../../supabase'
import { createResolutionJob, executeSourceFetch } from '../../../../../lib/resolution/engine'
import { logAudit } from '../../../../../lib/resolution/engine'
import { publishForecastEvent } from '../../../../../lib/forecast/queue/publisher'

interface ResolutionJobPayload {
  questionId: string
  resolutionClass?: string
  resolutionMode?: string
}

export async function runResolutionSourceJob(payload: ResolutionJobPayload): Promise<void> {
  const supabase = createWorkerSupabase()
  const { questionId } = payload

  console.log(`[resolution-source] Starting resolution for question ${questionId}`)

  // Create the resolution job
  const job = await createResolutionJob(supabase, questionId)
  if (!job) {
    console.log(`[resolution-source] No job created for ${questionId} (already exists or not eligible)`)
    return
  }

  try {
    // Execute source fetching
    const { evidenceCount } = await executeSourceFetch(supabase, job.id)
    console.log(`[resolution-source] Collected ${evidenceCount} evidence items for job ${job.id}`)

    // Queue proposal generation
    await publishForecastEvent({
      type: 'forecast.resolution.evidence.ready' as any,
      correlationId: questionId,
      payload: {
        jobId: job.id,
        questionId,
        evidenceCount,
      },
      producer: 'worker',
    })
  } catch (err) {
    console.error(`[resolution-source] Failed for job ${job.id}:`, err)

    const retryCount = job.retry_count + 1
    await supabase.from('resolution_jobs').update({
      status: retryCount >= 3 ? 'failed' : 'pending',
      failure_reason: err instanceof Error ? err.message : String(err),
      retry_count: retryCount,
      updated_at: new Date().toISOString(),
    }).eq('id', job.id)

    await logAudit(supabase, questionId, 'failed', {
      jobId: job.id,
      details: { phase: 'source_fetch', error: err instanceof Error ? err.message : String(err), retryCount },
    })

    if (retryCount >= 3) {
      // Mark question as needs_review
      await supabase.from('forecast_questions').update({
        status: 'needs_review',
        updated_at: new Date().toISOString(),
      }).eq('id', questionId)
    }

    throw err
  }
}
