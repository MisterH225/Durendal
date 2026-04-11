import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { data: tiers, error } = await db
    .from('tier_definitions')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tiers: tiers ?? [] })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { id, min_xp, min_questions, pro_days_reward, benefits_fr, benefits_en, name_fr, name_en, is_active } = body

  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (min_xp !== undefined) updates.min_xp = Math.max(0, Math.round(min_xp))
  if (min_questions !== undefined) updates.min_questions = Math.max(0, Math.round(min_questions))
  if (pro_days_reward !== undefined) updates.pro_days_reward = Math.max(0, Math.round(pro_days_reward))
  if (benefits_fr !== undefined) updates.benefits_fr = benefits_fr
  if (benefits_en !== undefined) updates.benefits_en = benefits_en
  if (name_fr !== undefined) updates.name_fr = name_fr
  if (name_en !== undefined) updates.name_en = name_en
  if (is_active !== undefined) updates.is_active = is_active

  const { error } = await db.from('tier_definitions').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
