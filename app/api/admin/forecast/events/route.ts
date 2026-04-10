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

export async function GET() {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const db = createAdminClient()
  const { data, error } = await db
    .from('forecast_events')
    .select('id, slug, title, description, status, starts_at, ends_at, tags, created_at, forecast_channels ( id, slug, name )')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data })
}

export async function POST(req: NextRequest) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const body = await req.json()
  const { channel_id, slug, title, description, status, starts_at, ends_at, tags } = body
  if (!channel_id || !slug || !title) return NextResponse.json({ error: 'channel_id, slug et title requis' }, { status: 400 })
  const db = createAdminClient()
  const { data, error } = await db
    .from('forecast_events')
    .insert({ channel_id, slug, title, description: description ?? null, status: status ?? 'draft', starts_at: starts_at ?? null, ends_at: ends_at ?? null, tags: tags ?? [], created_by: user.id })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data }, { status: 201 })
}
