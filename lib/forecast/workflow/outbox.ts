import type { UUID } from './types'
import type { IntelWorkflowEventName, IntelEventEnvelope } from './payloads'
import { createAdminClient } from '@/lib/supabase/admin'

interface AppendOptions<TPayload> {
  type: IntelWorkflowEventName
  correlationId: UUID
  payload: TPayload
  producer?: 'web' | 'worker' | 'system'
  causationId?: UUID
  idempotencyKey?: string
  topic?: string
}

/**
 * Append to intel_workflow_events (outbox) for auditing + async processing.
 * Keep light: do not throw on duplicate idempotency key.
 */
export async function appendIntelWorkflowEvent<TPayload extends Record<string, unknown>>(
  options: AppendOptions<TPayload>,
) {
  const admin = createAdminClient()
  const envelope: IntelEventEnvelope<TPayload> = {
    id: crypto.randomUUID(),
    type: options.type,
    occurredAt: new Date().toISOString(),
    correlationId: options.correlationId,
    causationId: options.causationId,
    producer: options.producer ?? 'worker',
    version: 1,
    payload: options.payload,
  }

  const { error } = await admin.from('intel_workflow_events').insert({
    topic: options.topic ?? options.type.split('.').slice(0, 2).join('.'),
    event_name: options.type,
    payload: envelope,
    correlation_id: envelope.correlationId,
    idempotency_key: options.idempotencyKey ?? null,
    producer: envelope.producer,
    occurred_at: envelope.occurredAt,
  })

  if (error && !String(error.message).includes('duplicate key value')) {
    throw new Error(`intel_workflow_events insert failed: ${error.message}`)
  }

  return envelope
}
