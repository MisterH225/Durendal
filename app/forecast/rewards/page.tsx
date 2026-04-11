import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import RewardsClient from './RewardsClient'

export const dynamic = 'force-dynamic'

export default async function RewardsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const db = createAdminClient()

  // Fetch all badge definitions
  const { data: badgeDefs } = await db
    .from('badge_definitions')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (!user) {
    return (
      <RewardsClient
        isAuthenticated={false}
        profile={null}
        badges={[]}
        badgeDefs={badgeDefs ?? []}
        streaks={[]}
        activeUnlocks={[]}
        notifications={[]}
        recentPoints={[]}
      />
    )
  }

  // Fetch user reward data
  const [profileRes, badgesRes, streaksRes, unlocksRes, notifRes, pointsRes] = await Promise.all([
    db.from('user_reward_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('user_badges')
      .select('*, badge_definitions(*)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false }),
    db.from('streak_states').select('*').eq('user_id', user.id),
    db.from('feature_unlocks')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true),
    db.from('reward_notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('seen', false)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('reward_points_ledger')
      .select('action, final_points, created_at, details')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <RewardsClient
      isAuthenticated={true}
      profile={profileRes.data}
      badges={badgesRes.data ?? []}
      badgeDefs={badgeDefs ?? []}
      streaks={streaksRes.data ?? []}
      activeUnlocks={unlocksRes.data ?? []}
      notifications={notifRes.data ?? []}
      recentPoints={pointsRes.data ?? []}
    />
  )
}
