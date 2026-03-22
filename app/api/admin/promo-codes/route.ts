import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { code, type, value, duration_months, applicable_plans, max_uses, new_users_only, expires_at } = body

  if (!code || !type || !value) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
  }

  const { data, error } = await supabase.from('promo_codes').insert({
    code: code.toUpperCase().trim(),
    type, value: parseInt(value),
    duration_months: duration_months || null,
    applicable_plans: applicable_plans || ['pro', 'business'],
    max_uses: max_uses || null,
    new_users_only: new_users_only || false,
    expires_at: expires_at || null,
    created_by: user.id,
    is_active: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, code: data })
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false })
  return NextResponse.json(data || [])
}
