import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishForecastEvent } from '@/lib/forecast/queue/publisher'
import { DISPUTE_WINDOW_HOURS } from '@/lib/resolution/types'

async function assertSuperadmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'superadmin' ? user : null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const { outcome, notes, resolution_url } = await req.json()
  if (!['resolved_yes', 'resolved_no', 'annulled', 'cancelled'].includes(outcome))
    return NextResponse.json({ error: 'outcome requis : resolved_yes | resolved_no | annulled | cancelled' }, { status: 400 })

  const db = createAdminClient()
  const now = new Date()
  const disputeWindowEnds = ['resolved_yes', 'resolved_no'].includes(outcome)
    ? new Date(now.getTime() + DISPUTE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
    : null

  const { error } = await db.from('forecast_questions').update({
    status: outcome,
    resolved_at: now.toISOString(),
    resolved_by: user.id,
    resolution_notes: notes ?? null,
    resolution_url: resolution_url ?? null,
    dispute_window_ends: disputeWindowEnds,
    updated_at: now.toISOString(),
  }).eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to resolution audit
  await db.from('resolution_audit_log').insert({
    question_id: params.id,
    action: outcome === 'annulled' ? 'admin_annulled' : outcome === 'cancelled' ? 'admin_cancelled' : 'admin_approved',
    actor_type: 'admin',
    actor_id: user.id,
    details: { outcome, notes, source: 'legacy_resolve_route' },
  }).then(() => {})

  // For annulled/cancelled, trigger scoring immediately (no scoring needed, but signal)
  // For resolved, the finalize job will trigger scoring after dispute window
  if (outcome === 'annulled') {
    await publishForecastEvent({
      type: 'forecast.resolution.ready',
      correlationId: params.id,
      payload: { questionId: params.id, outcome, resolvedBy: user.id },
    })
  }
  // resolved_yes/resolved_no will be finalized by resolution-finalize.job after dispute window

  return NextResponse.json({ ok: true, outcome, disputeWindowEnds })
}
