import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL

// POST /api/admin/switch-plan
// Permet au super admin de changer son propre plan pour tester
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    if (user.email !== SUPERADMIN_EMAIL) {
      return NextResponse.json({ error: 'Accès réservé au super admin' }, { status: 403 })
    }

    const { planName } = await req.json()
    if (!planName || !['free', 'pro', 'business'].includes(planName)) {
      return NextResponse.json({ error: 'planName invalide (free | pro | business)' }, { status: 400 })
    }

    // Trouver le plan par son name
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('id, display_name, name')
      .eq('name', planName)
      .single()

    if (planErr || !plan) {
      return NextResponse.json({ error: `Plan "${planName}" introuvable en base` }, { status: 404 })
    }

    // Récupérer l'account_id depuis profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', user.id)
      .single()

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'Profil sans account_id' }, { status: 404 })
    }

    // Mettre à jour le plan de l'account
    const { error: updateErr } = await supabase
      .from('accounts')
      .update({
        plan_id: plan.id,
        subscription_status: 'active',
      })
      .eq('id', profile.account_id)

    if (updateErr) throw updateErr

    return NextResponse.json({
      success: true,
      plan: { id: plan.id, name: plan.name, display_name: plan.display_name },
    })
  } catch (error: any) {
    console.error('[SwitchPlan] Erreur:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Erreur serveur' }, { status: 500 })
  }
}
