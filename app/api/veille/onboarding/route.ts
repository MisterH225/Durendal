import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { planName } = await req.json()
    if (!planName || !['free', 'pro', 'business'].includes(planName)) {
      return NextResponse.json({ error: 'planName invalide' }, { status: 400 })
    }

    const db = createAdminClient()

    const { data: profile } = await db
      .from('profiles')
      .select('account_id')
      .eq('id', user.id)
      .single()

    if (profile?.account_id) {
      return NextResponse.json({ error: 'Compte déjà configuré', redirect: '/dashboard' }, { status: 409 })
    }

    const { data: plan } = await db
      .from('plans')
      .select('id, name, display_name')
      .eq('name', planName)
      .single()

    if (!plan) {
      return NextResponse.json({ error: `Plan "${planName}" introuvable` }, { status: 404 })
    }

    const { data: account, error: accErr } = await db
      .from('accounts')
      .insert({
        type: 'individual',
        plan_id: plan.id,
        subscription_status: planName === 'free' ? 'active' : 'trial',
        trial_ends_at: planName === 'free' ? null : new Date(Date.now() + 14 * 86400000).toISOString(),
      })
      .select('id')
      .single()

    if (accErr || !account) {
      throw accErr ?? new Error('Impossible de créer le compte')
    }

    const { error: profErr } = await db
      .from('profiles')
      .update({ account_id: account.id })
      .eq('id', user.id)

    if (profErr) throw profErr

    return NextResponse.json({
      success: true,
      plan: plan.display_name,
      redirect: '/dashboard',
    })
  } catch (error: any) {
    console.error('[VeilleOnboarding]', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Erreur serveur' }, { status: 500 })
  }
}
