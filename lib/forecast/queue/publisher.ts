import { createAdminClient } from '@/lib/supabase/admin'
import type { EventEnvelope, ForecastEventType } from '@/packages/contracts/src'

interface PublishOptions<TPayload> {
  type: ForecastEventType
  correlationId: string
  payload: TPayload
  producer?: 'web' | 'worker'
  causationId?: string
}

export async function publishForecastEvent<TPayload extends Record<string, unknown>>(
  options: PublishOptions<TPayload>,
) {
  const admin = createAdminClient()

  const envelope: EventEnvelope<TPayload> = {
    id: crypto.randomUUID(),
    type: options.type,
    occurredAt: new Date().toISOString(),
    correlationId: options.correlationId,
    causationId: options.causationId,
    producer: options.producer ?? 'web',
    version: 1,
    payload: options.payload,
  }

  const { error } = await admin.from('forecast_event_queue').insert({
    event_type:     envelope.type,
    correlation_id: envelope.correlationId,
    payload:        envelope,
    status:         'pending',
    attempts:       0,
    max_attempts:   5,
    available_at:   new Date().toISOString(),
  })

  if (error) throw new Error(`Queue publish failed: ${error.message}`)
  return envelope
}
