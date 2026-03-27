import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { type, account_id, email, granted_plan, duration_days, expires_at, on_expiry, admin_note } = body

  if (!type || !granted_plan) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
  }

  const db = createAdminClient()

  // Résoudre account_id depuis email si nécessaire
  let resolvedAccountId = account_id
  if (!resolvedAccountId && email) {
    const { data: userProfile } = await db.from('profiles').select('account_id').eq('email', email).single()
    if (!userProfile) return NextResponse.json({ error: `Aucun compte trouvé pour ${email}` }, { status: 404 })
    resolvedAccountId = userProfile.account_id
  }

  if (!resolvedAccountId) {
    return NextResponse.json({ error: 'account_id ou email requis' }, { status: 400 })
  }

  // Récupère le plan actuel du compte
  const { data: account } = await db
    .from('accounts').select('plans(name)').eq('id', resolvedAccountId).single()
  const originalPlan = (account as any)?.plans?.name || 'free'

  let expiresAt: Date
  if (expires_at) {
    expiresAt = new Date(expires_at)
  } else {
    expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + parseInt(duration_days || '30'))
  }

  const activationLink = type === 'plan_upgrade'
    ? `${process.env.NEXT_PUBLIC_APP_URL}/activate/${Math.random().toString(36).substring(2, 15)}`
    : null

  const { data, error } = await db.from('special_access').insert({
    account_id: resolvedAccountId, type, granted_plan, original_plan: originalPlan,
    expires_at: expiresAt.toISOString(),
    on_expiry: on_expiry || 'downgrade',
    admin_note, activation_link: activationLink,
    created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Met à jour le plan du compte si profil test direct
  if (type === 'test_profile') {
    const { data: newPlan } = await db.from('plans').select('id').eq('name', granted_plan).single()
    if (newPlan) {
      await db.from('accounts').update({ plan_id: newPlan.id }).eq('id', resolvedAccountId)
    }
  }

  return NextResponse.json({ success: true, access: data, activation_link: activationLink })
}
