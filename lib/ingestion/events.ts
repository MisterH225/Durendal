// ============================================================================
// Ingestion event emitter — writes to intel_workflow_events and optionally
// forecast_event_queue for downstream consumption.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { IngestionEventName, ProviderId } from './types'

export async function emitIngestionEvent(
  db: SupabaseClient,
  name: IngestionEventName,
  providerId: ProviderId,
  correlationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString()

  await db.from('intel_workflow_events').insert({
    topic: 'ingestion',
    event_name: name,
    payload: { provider_id: providerId, ...payload },
    correlation_id: correlationId || undefined,
    producer: 'ingestion-worker',
    occurred_at: now,
  }).catch((e: any) => {
    console.warn(`[ingestion-events] Failed to emit ${name}:`, e?.message)
  })
}

/**
 * Emit a signal into the forecast_event_queue for downstream workers
 * (enrichment, event linking, materiality checks).
 */
export async function queueSignalForEnrichment(
  db: SupabaseClient,
  signalId: string,
  correlationId: string,
): Promise<void> {
  await db.from('forecast_event_queue').insert({
    event_type: 'ingestion.signal.ready_for_enrichment',
    correlation_id: correlationId || undefined,
    payload: { signal_id: signalId },
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    available_at: new Date().toISOString(),
  }).catch((e: any) => {
    console.warn('[ingestion-events] Failed to queue enrichment:', e?.message)
  })
}

/**
 * Emit a market movement signal into the queue.
 */
export async function queueMarketMoveSignal(
  db: SupabaseClient,
  marketId: string,
  previousProb: number | null,
  currentProb: number,
  correlationId: string,
): Promise<void> {
  const delta = previousProb != null ? Math.abs(currentProb - previousProb) : 0
  if (delta < 0.03) return

  await db.from('forecast_event_queue').insert({
    event_type: 'ingestion.market.move.detected',
    correlation_id: correlationId || undefined,
    payload: {
      market_id: marketId,
      previous_probability: previousProb,
      current_probability: currentProb,
      delta,
    },
    status: 'pending',
    attempts: 0,
    max_attempts: 3,
    available_at: new Date().toISOString(),
  }).catch((e: any) => {
    console.warn('[ingestion-events] Failed to queue market move:', e?.message)
  })
}
