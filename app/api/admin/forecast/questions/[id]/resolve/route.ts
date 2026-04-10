import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishForecastEvent } from '@/lib/forecast/queue/publisher'

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
  if (!['resolved_yes', 'resolved_no', 'annulled'].includes(outcome))
    return NextResponse.json({ error: 'outcome requis : resolved_yes | resolved_no | annulled' }, { status: 400 })
  const db = createAdminClient()
  const { error } = await db.from('forecast_questions').update({ status: outcome, resolved_at: new Date().toISOString(), resolved_by: user.id, resolution_notes: notes ?? null, resolution_url: resolution_url ?? null, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await publishForecastEvent({ type: 'forecast.resolution.ready', correlationId: params.id, payload: { questionId: params.id, outcome, resolvedBy: user.id } })
  return NextResponse.json({ ok: true, outcome })
}
