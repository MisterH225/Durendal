import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantProDays } from '@/lib/rewards/pro-grants'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { searchParams } = req.nextUrl
  const tab = searchParams.get('tab') ?? 'overview'

  if (tab === 'overview') {
    const [usersCount, badgesCount, unlocksCount, totalXP] = await Promise.all([
      db.from('user_reward_profiles').select('id', { count: 'exact', head: true }),
      db.from('user_badges').select('id', { count: 'exact', head: true }),
      db.from('feature_unlocks').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('user_reward_profiles').select('total_xp'),
    ])

    const xpSum = (totalXP.data ?? []).reduce((s, r) => s + (r.total_xp ?? 0), 0)

    const { data: tierDist } = await db
      .from('user_reward_profiles')
      .select('tier')

    const tiers: Record<string, number> = {}
    for (const r of tierDist ?? []) {
      tiers[r.tier] = (tiers[r.tier] ?? 0) + 1
    }

    return NextResponse.json({
      usersCount: usersCount.count ?? 0,
      badgesAwarded: badgesCount.count ?? 0,
      activeUnlocks: unlocksCount.count ?? 0,
      totalXPDistributed: xpSum,
      tierDistribution: tiers,
    })
  }

  if (tab === 'users') {
    const { data: users } = await db
      .from('user_reward_profiles')
      .select('*, profiles(full_name, email)')
      .order('total_xp', { ascending: false })
      .limit(100)

    return NextResponse.json({ users: users ?? [] })
  }

  if (tab === 'badges') {
    const { data: badges } = await db
      .from('badge_definitions')
      .select('*, user_badges(count)')
      .order('sort_order', { ascending: true })

    return NextResponse.json({ badges: badges ?? [] })
  }

  return NextResponse.json({ error: 'Tab invalide' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { action } = body

  if (action === 'grant_pro') {
    const { userId, days, reason } = body
    if (!userId || !days || !reason) {
      return NextResponse.json({ error: 'userId, days, reason requis' }, { status: 400 })
    }
    await grantProDays(db, userId, days, reason, `admin_grant_${user.id}`)
    return NextResponse.json({ ok: true, message: `${days} jours Pro attribués.` })
  }

  if (action === 'grant_badge') {
    const { userId, badgeSlug } = body
    const { data: badge } = await db
      .from('badge_definitions')
      .select('id')
      .eq('slug', badgeSlug)
      .single()
    if (!badge) return NextResponse.json({ error: 'Badge introuvable' }, { status: 404 })

    await db.from('user_badges').upsert({
      user_id: userId,
      badge_id: badge.id,
      context: { granted_by: user.id, manual: true },
    }, { onConflict: 'user_id,badge_id' })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
}
