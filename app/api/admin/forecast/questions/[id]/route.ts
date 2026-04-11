import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperadmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'superadmin' ? user : null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await assertSuperadmin()) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const db = createAdminClient()
  const { data: row, error } = await db
    .from('forecast_questions')
    .select('*, forecast_channels ( id, slug, name ), forecast_events ( id, slug, title )')
    .or(`id.eq.${params.id},slug.eq.${params.id}`)
    .single()
  if (error || !row) return NextResponse.json({ error: error?.message ?? 'Introuvable' }, { status: 404 })

  const { data: aiRows } = await db
    .from('forecast_ai_forecasts')
    .select('id, probability, confidence, model, reasoning, created_at')
    .eq('question_id', row.id)
    .eq('is_current', true)
    .limit(1)

  const ai = aiRows?.[0]
  const question = { ...row, forecast_ai_forecasts: ai ? [ai] : [] }
  return NextResponse.json({ question })
}

const QUESTION_STATUSES = new Set(['draft', 'open', 'paused', 'closed', 'resolved_yes', 'resolved_no', 'annulled'])

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await assertSuperadmin()) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const body = await req.json()
  if (body.status != null && !QUESTION_STATUSES.has(String(body.status))) {
    return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
  }
  const { created_by: _ignoreCreatedBy, id: _ignoreId, ...patch } = body
  const db = createAdminClient()
  const { data, error } = await db.from('forecast_questions').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!await assertSuperadmin()) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const db = createAdminClient()
  const { error } = await db.from('forecast_questions').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
