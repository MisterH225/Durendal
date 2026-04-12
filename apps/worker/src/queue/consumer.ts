import { createWorkerSupabase } from '../supabase'
import { runBlendedRecomputeJob } from '../jobs/forecast/blended-recompute.job'
import { runAIForecastJob } from '../jobs/forecast/ai-forecast.job'
import { runResolutionScoringJob } from '../jobs/forecast/resolution-scoring.job'
import { runNewsSignalJob } from '../jobs/forecast/news-signal.job'
import { runResolutionSourceJob } from '../jobs/resolution/resolution-source.job'
import { runResolutionProposalJob } from '../jobs/resolution/resolution-proposal.job'
import { runRewardProcessJob } from '../jobs/rewards/reward-process.job'
import { runSignalEnrichmentJob } from '../jobs/ingestion/signal-enrichment.job'
import { runMarketMoveJob } from '../jobs/ingestion/market-move.job'
import { FORECAST_TOPICS, INGESTION_TOPICS } from './topics'

type QueueRow = {
  id: string
  event_type: string
  payload: any
  attempts: number
  max_attempts: number
}

async function markDone(id: string) {
  const supabase = createWorkerSupabase()
  await supabase
    .from('forecast_event_queue')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .eq('id', id)
}

async function markFailed(row: QueueRow, error: unknown) {
  const supabase = createWorkerSupabase()
  const attempts  = row.attempts + 1
  const exhausted = attempts >= row.max_attempts
  const backoffMs = Math.min(60_000 * attempts, 10 * 60_000)
  const errMsg = error instanceof Error ? error.message : String(error)

  await supabase
    .from('forecast_event_queue')
    .update({
      status:       exhausted ? 'failed' : 'pending',
      attempts,
      last_error:   errMsg,
      available_at: new Date(Date.now() + backoffMs).toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq('id', row.id)

  if (exhausted) {
    try {
      await supabase.from('intel_workflow_failures').insert({
        ref_table: 'forecast_event_queue',
        ref_id: row.id,
        error_code: 'queue_exhausted',
        error_message: errMsg.slice(0, 500),
        payload: { event_type: row.event_type, attempts },
      })
    } catch {
      /* table absente ou RLS */
    }
  }
}

async function lockPendingBatch(limit = 10): Promise<QueueRow[]> {
  const supabase = createWorkerSupabase()
  const now = new Date().toISOString()

  const { data: pending } = await supabase
    .from('forecast_event_queue')
    .select('id, event_type, payload, attempts, max_attempts')
    .eq('status', 'pending')
    .lte('available_at', now)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!pending?.length) return []

  const ids = pending.map(r => r.id)
  await supabase
    .from('forecast_event_queue')
    .update({ status: 'running', updated_at: now })
    .in('id', ids)

  return pending as QueueRow[]
}

async function processOne(row: QueueRow) {
  // Payload is nested: { ...envelope, payload: { ...jobPayload } }
  const jobPayload = row.payload?.payload ?? row.payload

  switch (row.event_type) {
    case FORECAST_TOPICS.BLENDED_RECOMPUTE_REQUESTED:
      await runBlendedRecomputeJob(jobPayload)
      break

    case FORECAST_TOPICS.AI_FORECAST_REQUESTED:
      await runAIForecastJob(jobPayload)
      break

    case FORECAST_TOPICS.RESOLUTION_READY:
      await runResolutionScoringJob(jobPayload)
      break

    case FORECAST_TOPICS.NEWS_SIGNAL_REQUESTED:
      await runNewsSignalJob()
      break

    case FORECAST_TOPICS.RESOLUTION_JOB_CREATED:
      await runResolutionSourceJob(jobPayload)
      break

    case FORECAST_TOPICS.RESOLUTION_EVIDENCE_READY:
      await runResolutionProposalJob(jobPayload)
      break

    case FORECAST_TOPICS.RESOLUTION_APPROVED:
      // Scoring is triggered by resolution-finalize after dispute window
      break

    case FORECAST_TOPICS.REWARD_PROCESS:
      await runRewardProcessJob(jobPayload)
      break

    case FORECAST_TOPICS.USER_FORECAST_SUBMITTED:
      // No-op: submit already queues a separate blended.recompute.requested.
      break

    // ── Ingestion events ──────────────────────────────────────────────────
    case INGESTION_TOPICS.SIGNAL_READY_FOR_ENRICHMENT:
      await runSignalEnrichmentJob(jobPayload)
      break

    case INGESTION_TOPICS.MARKET_MOVE_DETECTED:
      await runMarketMoveJob(jobPayload)
      break

    case INGESTION_TOPICS.SIGNAL_LINKED_TO_EVENT:
    case INGESTION_TOPICS.SIGNAL_LINK_NEEDS_REVIEW:
      // Informational events — logged via outbox, no worker action needed
      break

    default:
      console.warn(`[consumer] Event type inconnu ignoré : ${row.event_type}`)
      break
  }
}

export async function consumeForecastQueueOnce() {
  const rows = await lockPendingBatch(20)
  if (!rows.length) return 0

  for (const row of rows) {
    try {
      await processOne(row)
      await markDone(row.id)
    } catch (e) {
      console.error(`[consumer] Job échoué (${row.event_type} / ${row.id}) :`, e)
      await markFailed(row, e)
    }
  }

  return rows.length
}
