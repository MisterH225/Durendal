import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLocale } from '@/lib/i18n/server'
import LeaderboardRewardsClient from './LeaderboardRewardsClient'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const db = createAdminClient()
  const locale = getLocale()

  let userId: string | null = null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch { /* non-auth */ }

  // ── Left panel data ──────────────────────────────────────────────────────

  const { data: leaderboard } = await db
    .from('forecast_leaderboard')
    .select('user_id, display_name, avg_brier_score, questions_scored, good_predictions, accuracy_pct, rank')
    .not('avg_brier_score', 'is', null)
    .gte('questions_scored', 1)
    .order('avg_brier_score', { ascending: true })
    .limit(50)

  const { count: totalUsers } = await db
    .from('forecast_leaderboard')
    .select('user_id', { count: 'exact', head: true })
    .not('avg_brier_score', 'is', null)

  // Most active users (by XP)
  const { data: mostActive } = await db
    .from('user_reward_profiles')
    .select('user_id, total_xp, tier, current_streak, forecasts_submitted')
    .order('total_xp', { ascending: false })
    .limit(10)

  const activeUserIds = (mostActive ?? []).map(u => u.user_id)
  const { data: activeProfiles } = activeUserIds.length
    ? await db.from('profiles').select('id, full_name, avatar_url').in('id', activeUserIds)
    : { data: [] }
  const activeProfileMap = new Map((activeProfiles ?? []).map(p => [p.id, p]))

  const enrichedActive = (mostActive ?? []).map(u => ({
    ...u,
    display_name: activeProfileMap.get(u.user_id)?.full_name ?? 'Anonyme',
    avatar_url: activeProfileMap.get(u.user_id)?.avatar_url ?? null,
  }))

  // Recent badge unlocks (global)
  const { data: recentBadgeUnlocks } = await db
    .from('user_badges')
    .select('user_id, earned_at, badge_definitions(name_fr, icon, tier, slug)')
    .order('earned_at', { ascending: false })
    .limit(8)

  const badgeUserIds = [...new Set((recentBadgeUnlocks ?? []).map(b => b.user_id))]
  const { data: badgeProfiles } = badgeUserIds.length
    ? await db.from('profiles').select('id, full_name').in('id', badgeUserIds)
    : { data: [] }
  const badgeProfileMap = new Map((badgeProfiles ?? []).map(p => [p.id, p]))

  const enrichedRecentBadges = (recentBadgeUnlocks ?? []).map(b => ({
    ...b,
    display_name: badgeProfileMap.get(b.user_id)?.full_name ?? 'Anonyme',
  }))

  // ── Right panel data (user-specific) ─────────────────────────────────────

  let rewardProfile = null
  let userBadges: any[] = []
  let streaks: any[] = []
  let activeUnlocks: any[] = []
  let notifications: any[] = []
  let recentPoints: any[] = []

  if (userId) {
    const [profileRes, badgesRes, streaksRes, unlocksRes, notifRes, pointsRes] = await Promise.all([
      db.from('user_reward_profiles').select('*').eq('user_id', userId).maybeSingle(),
      db.from('user_badges')
        .select('*, badge_definitions(*)')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false }),
      db.from('streak_states').select('*').eq('user_id', userId),
      db.from('feature_unlocks')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true),
      db.from('reward_notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('seen', false)
        .order('created_at', { ascending: false })
        .limit(10),
      db.from('reward_points_ledger')
        .select('action, final_points, created_at, details')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    rewardProfile = profileRes.data
    userBadges = badgesRes.data ?? []
    streaks = streaksRes.data ?? []
    activeUnlocks = unlocksRes.data ?? []
    notifications = notifRes.data ?? []
    recentPoints = pointsRes.data ?? []
  }

  // Badge definitions for the badge grid
  const { data: badgeDefs } = await db
    .from('badge_definitions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  // Tier definitions for the tier display
  const { data: tierDefs } = await db
    .from('tier_definitions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return (
    <LeaderboardRewardsClient
      locale={locale}
      isAuthenticated={!!userId}
      leaderboard={leaderboard ?? []}
      totalUsers={totalUsers ?? 0}
      mostActive={enrichedActive}
      recentBadgeUnlocks={enrichedRecentBadges}
      rewardProfile={rewardProfile}
      userBadges={userBadges}
      badgeDefs={badgeDefs ?? []}
      streaks={streaks}
      activeUnlocks={activeUnlocks}
      notifications={notifications}
      recentPoints={recentPoints}
      tierDefs={tierDefs ?? []}
    />
  )
}
