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

  const previousSnapshot = await fetchPreviousSnapshot(admin, input.intelEventId, input.snapshotId)
  const signalTrust = await resolveSignalTrustTier(admin, input.triggerSignalIds)
  const novelty = computeSnapshotNovelty(snapshot, previousSnapshot)
  const contradiction = computeContradiction(snapshot, previousSnapshot)
  const newKeyEntity = detectNewKeyEntities(snapshot, previousSnapshot)
  const regionChanged = previousSnapshot?.structured_facts?.primary_region !== (snapshot.structured_facts as any)?.primary_region
  const sectorChanged = previousSnapshot?.structured_facts?.sectors?.join() !== (snapshot.structured_facts as any)?.sectors?.join()

  const factors = computeMaterialityScore({
    sourceTrustTier: signalTrust,
    novelty,
    contradiction,
    newKeyEntity,
    prevSeverity: previousSnapshot?.severity ?? event.severity ?? 2,
    nextSeverity: event.severity ?? 2,
    regionChanged,
    sectorChanged,
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

// ── Helper: fetch the previous snapshot for diff-based scoring ─────────────

type SnapshotRow = { id: string; structured_facts: any; severity?: number }

async function fetchPreviousSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  intelEventId: UUID,
  currentSnapshotId: UUID,
): Promise<SnapshotRow | null> {
  const { data } = await admin
    .from('intel_event_context_snapshots')
    .select('id, structured_facts')
    .eq('intel_event_id', intelEventId)
    .neq('id', currentSnapshotId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

async function resolveSignalTrustTier(
  admin: ReturnType<typeof createAdminClient>,
  signalIds?: UUID[],
): Promise<number> {
  if (!signalIds?.length) return 3
  const { data } = await admin
    .from('source_trust_profiles')
    .select('trust_score')
    .limit(1)
  if (!data?.length) return 3
  const score = data[0].trust_score ?? 0.5
  if (score >= 0.8) return 5
  if (score >= 0.6) return 4
  if (score >= 0.4) return 3
  if (score >= 0.2) return 2
  return 1
}

function computeSnapshotNovelty(current: SnapshotRow, previous: SnapshotRow | null): number {
  if (!previous) return 0.5
  const currentFacts = JSON.stringify(current.structured_facts ?? {})
  const previousFacts = JSON.stringify(previous.structured_facts ?? {})
  if (currentFacts === previousFacts) return 0
  const currentKeys = Object.keys(current.structured_facts ?? {})
  const previousKeys = new Set(Object.keys(previous.structured_facts ?? {}))
  const newKeys = currentKeys.filter(k => !previousKeys.has(k))
  return Math.min(1, 0.2 + (newKeys.length * 0.15))
}

function computeContradiction(current: SnapshotRow, previous: SnapshotRow | null): number {
  if (!previous?.structured_facts || !current.structured_facts) return 0
  const prev = previous.structured_facts as Record<string, unknown>
  const curr = current.structured_facts as Record<string, unknown>
  let contradictions = 0
  let comparisons = 0
  for (const key of Object.keys(prev)) {
    if (key in curr && typeof prev[key] === typeof curr[key]) {
      comparisons++
      if (JSON.stringify(prev[key]) !== JSON.stringify(curr[key])) contradictions++
    }
  }
  return comparisons > 0 ? Math.min(1, contradictions / comparisons) : 0
}

function detectNewKeyEntities(current: SnapshotRow, previous: SnapshotRow | null): boolean {
  const currEntities = (current.structured_facts as any)?.key_entities ?? []
  if (!previous) return currEntities.length > 0
  const prevEntities = new Set((previous.structured_facts as any)?.key_entities ?? [])
  return currEntities.some((e: string) => !prevEntities.has(e))
}
