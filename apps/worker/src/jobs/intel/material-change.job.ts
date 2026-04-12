import { createAdminClient } from '@/lib/supabase/admin'
import { computeMaterialityScore } from '@/lib/forecast/workflow/scoring'
import { buildRecalculationIdempotencyKey } from '@/lib/forecast/workflow/idempotency'
import { appendIntelWorkflowEvent } from '@/lib/forecast/workflow/outbox'
import type { UUID } from '@/lib/forecast/workflow/types'

/**
 * Materiality evaluator (MVP).
 * Input: intel_event_id, context_snapshot_id, signal_ids (optional).
 * Output: intel_recalculation_requests + intel_recalculation_jobs.
 */
export async function runMaterialChangeJob(input: {
  intelEventId: UUID
  snapshotId: UUID
  triggerSignalIds?: UUID[]
  correlationId?: UUID
}) {
  const admin = createAdminClient()
  const correlationId = input.correlationId ?? crypto.randomUUID()

  const [{ data: event }, { data: snapshot }, { data: links }] = await Promise.all([
    admin.from('intel_events').select('id, severity, primary_region, sectors').eq('id', input.intelEventId).single(),
    admin.from('intel_event_context_snapshots').select('id, structured_facts').eq('id', input.snapshotId).single(),
    admin.from('intel_event_signal_links').select('signal_id').eq('intel_event_id', input.intelEventId).limit(20),
  ])

  if (!event || !snapshot) return { status: 'skipped', reason: 'missing_event_or_snapshot' } as const

  const factors = computeMaterialityScore({
    sourceTrustTier: 3,
    novelty: 0.25,
    contradiction: 0.1,
    newKeyEntity: false,
    prevSeverity: event.severity ?? 2,
    nextSeverity: event.severity ?? 2,
    regionChanged: false,
    sectorChanged: false,
    timelineDeltaDays: null,
    signalConfidence: 0.6,
    duplicatePenalty: 0,
    highImpactKeywordHits: 0,
  })

  if (factors.decision === 'suppress') {
    await appendIntelWorkflowEvent({
      type: 'intel.event.material_change.detected',
      correlationId,
      payload: {
        intelEventId: input.intelEventId,
        snapshotId: input.snapshotId,
        materialityScore: factors.score,
        factors: Object.keys(factors.parts),
        signalIds: input.triggerSignalIds ?? (links ?? []).map(l => l.signal_id),
      },
      idempotencyKey: `${input.intelEventId}:${input.snapshotId}:suppress`,
      producer: 'worker',
    })

    return { status: 'suppressed', score: factors.score } as const
  }

  const { data: questionLinks } = await admin
    .from('intel_question_event_links')
    .select('question_id')
    .eq('intel_event_id', input.intelEventId)

  const questionIds = (questionLinks ?? []).map(q => q.question_id as UUID)
  if (questionIds.length === 0) return { status: 'skipped', reason: 'no_questions' } as const

  const idempotencyKey = buildRecalculationIdempotencyKey(input.intelEventId, input.snapshotId, questionIds)

  const { data: existing } = await admin
    .from('intel_recalculation_requests')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existing?.id) return { status: 'duplicate', requestId: existing.id } as const

  const { data: request, error: reqErr } = await admin.from('intel_recalculation_requests').insert({
    idempotency_key: idempotencyKey,
    status: 'pending',
    intel_event_id: input.intelEventId,
    context_snapshot_id: input.snapshotId,
    correlation_id: correlationId,
    question_ids: questionIds,
    trigger_signal_ids: input.triggerSignalIds ?? (links ?? []).map(l => l.signal_id),
    materiality_score: factors.score,
    materiality_factors: Object.entries(factors.parts).map(([k, v]) => ({ key: k, value: v })),
    reason: factors.decision === 'review' ? 'needs_review' : 'material_change',
    requested_by: 'system',
  }).select('id').single()

  if (reqErr || !request) {
    return { status: 'failed', reason: reqErr?.message ?? 'insert_failed' } as const
  }

  // Fan-out per question
  const jobs = questionIds.map(questionId => ({
    request_id: request.id,
    question_id: questionId,
    status: 'pending',
  }))

  await admin.from('intel_recalculation_jobs').insert(jobs)

  await appendIntelWorkflowEvent({
    type: 'intel.question.recalculation.requested',
    correlationId,
    payload: {
      requestId: request.id,
      questionIds,
      intelEventId: input.intelEventId,
      contextSnapshotId: input.snapshotId,
      triggerSignalIds: input.triggerSignalIds ?? (links ?? []).map(l => l.signal_id),
      materialityScore: factors.score,
      reason: factors.decision === 'review' ? 'needs_review' : 'material_change',
    },
    idempotencyKey,
    producer: 'worker',
  })

  return { status: 'scheduled', requestId: request.id, score: factors.score } as const
}
