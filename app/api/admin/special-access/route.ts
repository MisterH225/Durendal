import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { type, account_id, granted_plan, duration_days, on_expiry, admin_note } = body

  if (!type || !account_id || !granted_plan || !duration_days) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
  }

  // Récupère le plan actuel du compte
  const { data: account } = await supabase
    .from('accounts').select('plans(name)').eq('id', account_id).single()
  const originalPlan = (account as any)?.plans?.name || 'free'

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + parseInt(duration_days))

  // Génère un lien d'activation unique pour les upgrades
  const activationLink = type === 'plan_upgrade'
    ? `${process.env.NEXT_PUBLIC_APP_URL}/activate/${Math.random().toString(36).substring(2, 15)}`
    : null

  const { data, error } = await supabase.from('special_access').insert({
    account_id, type, granted_plan, original_plan: originalPlan,
    expires_at: expiresAt.toISOString(),
    on_expiry: on_expiry || 'downgrade',
    admin_note, activation_link: activationLink,
    created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Met à jour le plan du compte si profil test direct
  if (type === 'test_profile') {
    const { data: newPlan } = await supabase.from('plans').select('id').eq('name', granted_plan).single()
    if (newPlan) {
      await supabase.from('accounts').update({ plan_id: newPlan.id }).eq('id', account_id)
    }
  }

  return NextResponse.json({ success: true, access: data, activation_link: activationLink })
}
