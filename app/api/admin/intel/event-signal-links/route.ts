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
 * PATCH /api/admin/intel/event-signal-links
 * Correction manuelle du lien signal ↔ intel_event.
 * Body: { action: 'link' | 'unlink', intelEventId: string, signalId: string, linkConfidence?: number, linkReason?: string }
 */
export async function PATCH(req: NextRequest) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const action = body?.action === 'unlink' ? 'unlink' : body?.action === 'link' ? 'link' : null
  const intelEventId = typeof body?.intelEventId === 'string' ? body.intelEventId : null
  const signalId = typeof body?.signalId === 'string' ? body.signalId : null

  if (!action || !intelEventId || !signalId) {
    return NextResponse.json(
      { error: 'Champs requis: action (link|unlink), intelEventId, signalId' },
      { status: 400 },
    )
  }

  const db = createAdminClient()
  const correlationId = crypto.randomUUID()

  if (action === 'unlink') {
    const { error } = await db
      .from('intel_event_signal_links')
      .delete()
      .eq('intel_event_id', intelEventId)
      .eq('signal_id', signalId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await appendIntelWorkflowEvent({
      type: 'intel.signal.rejected',
      correlationId,
      producer: 'web',
      payload: {
        signalId,
        reasonCode: 'admin_unlink',
        detail: `intel_event ${intelEventId} — par ${user.id}`,
      },
      idempotencyKey: `admin:unlink:${intelEventId}:${signalId}:${correlationId}`,
    })

    return NextResponse.json({ ok: true, action: 'unlink', intelEventId, signalId })
  }

  const linkConfidence = typeof body?.linkConfidence === 'number'
    ? Math.min(1, Math.max(0, body.linkConfidence))
    : 1
  const linkReason = typeof body?.linkReason === 'string' ? body.linkReason : `admin_link:${user.id}`

  const { data: ev } = await db.from('intel_events').select('id').eq('id', intelEventId).maybeSingle()
  const { data: sig } = await db.from('signals').select('id').eq('id', signalId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'intel_event introuvable' }, { status: 404 })
  if (!sig) return NextResponse.json({ error: 'signal introuvable' }, { status: 404 })

  const { error: upsertErr } = await db.from('intel_event_signal_links').upsert(
    {
      intel_event_id: intelEventId,
      signal_id: signalId,
      link_confidence: linkConfidence,
      link_reason: linkReason,
    },
    { onConflict: 'intel_event_id,signal_id' },
  )

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  await appendIntelWorkflowEvent({
    type: 'intel.signal.linked',
    correlationId,
    producer: 'web',
    payload: {
      signalId,
      intelEventId,
      linkConfidence,
    },
    idempotencyKey: `admin:link:${intelEventId}:${signalId}:${correlationId}`,
  })

  return NextResponse.json({
    ok: true,
    action: 'link',
    intelEventId,
    signalId,
    linkConfidence,
 })
}
