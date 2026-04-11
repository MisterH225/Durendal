/**
 * resolution-proposal.job.ts
 *
 * Consumes `forecast.resolution.evidence.ready` events.
 * Generates a resolution proposal from collected evidence.
 * Either auto-resolves (Class A + high confidence) or queues for admin review.
 */

import { createWorkerSupabase } from '../../supabase'
import { executeProposalGeneration, logAudit } from '../../../../../lib/resolution/engine'
import { publishForecastEvent } from '../../../../../lib/forecast/queue/publisher'

interface EvidenceReadyPayload {
  jobId: string
  questionId: string
  evidenceCount: number
}

export async function runResolutionProposalJob(payload: EvidenceReadyPayload): Promise<void> {
  const supabase = createWorkerSupabase()
  const { jobId, questionId, evidenceCount } = payload

  console.log(`[resolution-proposal] Generating proposal for job ${jobId} (${evidenceCount} evidence items)`)

  try {
    const { proposalId, autoResolved } = await executeProposalGeneration(supabase, jobId)

    if (autoResolved) {
      console.log(`[resolution-proposal] Auto-resolved job ${jobId} — queuing scoring`)

      // Load the outcome from the job
      const { data: job } = await supabase
        .from('resolution_jobs')
        .select('proposed_outcome')
        .eq('id', jobId)
        .single()

      await publishForecastEvent({
        type: 'forecast.resolution.approved' as any,
        correlationId: questionId,
        payload: {
          jobId,
          questionId,
          outcome: job?.proposed_outcome,
          approvedBy: null,
          autoResolved: true,
        },
        producer: 'worker',
      })
    } else {
      console.log(`[resolution-proposal] Proposal ${proposalId} pending admin review for job ${jobId}`)
    }
  } catch (err) {
    console.error(`[resolution-proposal] Failed for job ${jobId}:`, err)

    await supabase.from('resolution_jobs').update({
      status: 'failed',
      failure_reason: err instanceof Error ? err.message : String(err),
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)

    await logAudit(supabase, questionId, 'failed', {
      jobId,
      details: { phase: 'proposal_generation', error: err instanceof Error ? err.message : String(err) },
    })

    throw err
  }
}
