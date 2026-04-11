import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import RewardsAdminClient from './RewardsAdminClient'

export default async function AdminRewardsPage() {
  const supabase = createClient()
  const db = createAdminClient()

  // Overview stats
  const [usersRes, badgesRes, unlocksRes, xpRes, tierRes, badgeDefsRes] = await Promise.all([
    db.from('user_reward_profiles').select('id', { count: 'exact', head: true }),
    db.from('user_badges').select('id', { count: 'exact', head: true }),
    db.from('feature_unlocks').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('user_reward_profiles').select('total_xp'),
    db.from('user_reward_profiles').select('tier'),
    db.from('badge_definitions').select('*').order('sort_order', { ascending: true }),
  ])

  const xpSum = (xpRes.data ?? []).reduce((s, r) => s + (r.total_xp ?? 0), 0)
  const tiers: Record<string, number> = {}
  for (const r of tierRes.data ?? []) {
    tiers[r.tier] = (tiers[r.tier] ?? 0) + 1
  }

  // Top users by XP
  const { data: topUsers } = await db
    .from('user_reward_profiles')
    .select('user_id, total_xp, level, tier, forecasts_submitted, questions_resolved, avg_brier_score, current_streak, longest_streak')
    .order('total_xp', { ascending: false })
    .limit(50)

  // Enrich with profiles
  const userIds = (topUsers ?? []).map(u => u.user_id)
  const { data: profiles } = userIds.length
    ? await db.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] }

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))
  const enrichedUsers = (topUsers ?? []).map(u => ({
    ...u,
    full_name: profileMap.get(u.user_id)?.full_name ?? 'Anonyme',
    email: profileMap.get(u.user_id)?.email ?? '',
  }))

  return (
    <RewardsAdminClient
      stats={{
        usersCount: usersRes.count ?? 0,
        badgesAwarded: badgesRes.count ?? 0,
        activeUnlocks: unlocksRes.count ?? 0,
        totalXP: xpSum,
        tierDistribution: tiers,
      }}
      badges={badgeDefsRes.data ?? []}
      users={enrichedUsers}
    />
  )
}
