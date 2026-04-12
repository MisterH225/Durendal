import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { appendIntelWorkflowEvent } from '@/lib/forecast/workflow/outbox'

async function assertSuperadmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'superadmin' ? user : null
}

/**
 * POST /api/admin/intel/recalculate
 * Force un recalcul intel : crée intel_recalculation_requests + jobs (traités par le worker).
 * Body: { questionIds: string[], intelEventId?, contextSnapshotId?, triggerSignalIds?, bypassCooldown?: boolean }
 */
export async function POST(req: NextRequest) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const questionIds: string[] = Array.isArray(body?.questionIds) ? body.questionIds.filter(Boolean) : []
  if (questionIds.length === 0) {
    return NextResponse.json({ error: 'questionIds requis (tableau non vide)' }, { status: 400 })
  }

  const intelEventId: string | null = typeof body?.intelEventId === 'string' ? body.intelEventId : null
  const contextSnapshotId: string | null = typeof body?.contextSnapshotId === 'string' ? body.contextSnapshotId : null
  const triggerSignalIds: string[] = Array.isArray(body?.triggerSignalIds)
    ? body.triggerSignalIds.filter(Boolean)
    : []
  const bypassCooldown = body?.bypassCooldown === true

  const db = createAdminClient()
  const correlationId = crypto.randomUUID()
  const idempotencyKey = `admin:${user.id}:${correlationId}`

  if (bypassCooldown) {
    await db.from('intel_question_recalc_cooldown').delete().in('question_id', questionIds)
  }

  const { data: questions, error: qErr } = await db
    .from('forecast_questions')
    .select('id')
    .in('id', questionIds)

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  const foundIds = new Set((questions ?? []).map((q: { id: string }) => q.id))
  const missing = questionIds.filter(id => !foundIds.has(id))
  if (missing.length) {
    return NextResponse.json({ error: 'Questions introuvables', missing }, { status: 404 })
  }

  const { data: request, error: reqErr } = await db
    .from('intel_recalculation_requests')
    .insert({
      idempotency_key: idempotencyKey,
      status: 'pending',
      intel_event_id: intelEventId,
      context_snapshot_id: contextSnapshotId,
      correlation_id: correlationId,
      question_ids: questionIds,
      trigger_signal_ids: triggerSignalIds,
      materiality_score: 100,
      materiality_factors: [{ key: 'admin_force', value: true }],
      reason: 'admin_force',
      requested_by: `admin:${user.id}`,
    })
    .select('id')
    .single()

  if (reqErr || !request) {
    return NextResponse.json({ error: reqErr?.message ?? 'insert request failed' }, { status: 500 })
  }

  const jobs = questionIds.map(questionId => ({
    request_id: request.id,
    question_id: questionId,
    status: 'pending' as const,
  }))

  const { error: jobErr } = await db.from('intel_recalculation_jobs').insert(jobs)
  if (jobErr) {
    await db.from('intel_recalculation_requests').update({ status: 'failed', last_error: jobErr.message }).eq('id', request.id)
    return NextResponse.json({ error: jobErr.message }, { status: 500 })
  }

  await appendIntelWorkflowEvent({
    type: 'intel.question.recalculation.requested',
    correlationId,
    producer: 'web',
    payload: {
      requestId: request.id,
      questionIds,
      intelEventId: intelEventId ?? '',
      contextSnapshotId: contextSnapshotId ?? '',
      triggerSignalIds,
      materialityScore: 100,
      reason: 'admin_force',
    },
    idempotencyKey,
  })

  return NextResponse.json({
    ok: true,
    requestId: request.id,
    correlationId,
    questionCount: questionIds.length,
    bypassCooldown,
  })
}
