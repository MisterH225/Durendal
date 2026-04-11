import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'superadmin' ? user : null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) updates.name = body.name
  if (body.slug !== undefined) updates.slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
  if (body.description !== undefined) updates.description = body.description
  if (body.name_fr !== undefined) updates.name_fr = body.name_fr
  if (body.name_en !== undefined) updates.name_en = body.name_en
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order
  if (body.is_active !== undefined) updates.is_active = body.is_active
  updates.updated_at = new Date().toISOString()

  const db = createAdminClient()
  const { data, error } = await db
    .from('forecast_channels')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ channel: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const db = createAdminClient()

  const { count } = await db
    .from('forecast_questions')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `Impossible de supprimer : ${count} question(s) liée(s). Désactivez-la plutôt.` },
      { status: 409 },
    )
  }

  const { error } = await db.from('forecast_channels').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
