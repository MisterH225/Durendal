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

export async function GET(req: NextRequest) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const db = createAdminClient()
  let query = db
    .from('forecast_questions')
    .select('id, slug, title, status, close_date, featured, forecast_count, crowd_probability, ai_probability, blended_probability, created_at, forecast_channels ( id, slug, name ), forecast_events ( id, slug, title )')
    .order('created_at', { ascending: false })
    .limit(200)
  const status = searchParams.get('status')
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data })
}

export async function POST(req: NextRequest) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const body = await req.json()
  const { event_id, channel_id, slug, title, description, close_date, resolution_source, resolution_criteria, resolution_url, status, tags, featured } = body
  if (!event_id || !channel_id || !slug || !title || !close_date || !resolution_source || !resolution_criteria)
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
  const db = createAdminClient()
  const { data, error } = await db
    .from('forecast_questions')
    .insert({ event_id, channel_id, slug, title, description: description ?? null, close_date, resolution_source, resolution_criteria, resolution_url: resolution_url ?? null, status: status ?? 'draft', tags: tags ?? [], featured: featured ?? false, created_by: user.id })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data }, { status: 201 })
}
