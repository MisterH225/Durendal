import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const db = createAdminClient()

  const [profileRes, badgesRes, streaksRes, unlocksRes, notifRes, recentPointsRes] = await Promise.all([
    db.from('user_reward_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    db.from('user_badges')
      .select('*, badge_definitions(*)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false }),
    db.from('streak_states').select('*').eq('user_id', user.id),
    db.from('feature_unlocks')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .gte('expires_at', new Date().toISOString()),
    db.from('reward_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('reward_points_ledger')
      .select('action, final_points, created_at, details')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({
    profile: profileRes.data,
    badges: badgesRes.data ?? [],
    streaks: streaksRes.data ?? [],
    activeUnlocks: unlocksRes.data ?? [],
    notifications: notifRes.data ?? [],
    recentPoints: recentPointsRes.data ?? [],
  })
}
