import type { SupabaseClient } from '@supabase/supabase-js'
import type { BadgeDefinition } from './types'
import { awardPoints } from './scoring'

export async function checkAndAwardBadges(
  supabase: SupabaseClient,
  userId: string,
  context?: { action?: string; questionId?: string; channelSlug?: string },
): Promise<string[]> {
  // Load all active badge definitions
  const { data: badges } = await supabase
    .from('badge_definitions')
    .select('*')
    .eq('is_active', true)

  if (!badges?.length) return []

  // Load user's existing badges
  const { data: userBadges } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId)

  const earnedIds = new Set((userBadges ?? []).map(b => b.badge_id))
  const awarded: string[] = []

  for (const badge of badges as BadgeDefinition[]) {
    if (earnedIds.has(badge.id)) continue

    const eligible = await checkBadgeEligibility(supabase, userId, badge)
    if (!eligible) continue

    // Award badge
    await supabase.from('user_badges').insert({
      user_id: userId,
      badge_id: badge.id,
      context: context ?? {},
    })

    // Award badge XP
    if (badge.points_value > 0) {
      await awardPoints(supabase, userId, 'badge_earned', {
        baseOverride: badge.points_value,
        referenceId: badge.id,
        referenceType: 'badge',
        details: { badge_slug: badge.slug },
      })
    }

    // Notification
    await supabase.from('reward_notifications').insert({
      user_id: userId,
      type: 'badge_earned',
      title: badge.name_fr,
      body: badge.description_fr,
      data: { badge_id: badge.id, badge_slug: badge.slug, icon: badge.icon, tier: badge.tier },
    })

    awarded.push(badge.slug)
  }

  return awarded
}

async function checkBadgeEligibility(
  supabase: SupabaseClient,
  userId: string,
  badge: BadgeDefinition,
): Promise<boolean> {
  const rule = badge.unlock_rule
  if (!rule || !rule.type) return false

  switch (rule.type) {
    case 'forecast_count': {
      const { data: profile } = await supabase
        .from('user_reward_profiles')
        .select('forecasts_submitted')
        .eq('user_id', userId)
        .single()
      return (profile?.forecasts_submitted ?? 0) >= (rule.threshold as number)
    }

    case 'accuracy_count': {
      const { count } = await supabase
        .from('forecast_brier_scores')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .lt('brier_score', rule.brier_threshold as number)
      return (count ?? 0) >= (rule.threshold as number)
    }

    case 'avg_brier': {
      const { data: profile } = await supabase
        .from('user_reward_profiles')
        .select('avg_brier_score, questions_resolved')
        .eq('user_id', userId)
        .single()
      if (!profile?.avg_brier_score) return false
      return profile.avg_brier_score < (rule.brier_threshold as number) &&
             (profile.questions_resolved ?? 0) >= (rule.min_questions as number)
    }

    case 'category_count': {
      const { data: channel } = await supabase
        .from('forecast_channels')
        .select('id')
        .eq('slug', rule.category as string)
        .single()
      if (!channel) return false

      const { data: questionIds } = await supabase
        .from('forecast_questions')
        .select('id')
        .eq('channel_id', channel.id)

      if (!questionIds?.length) return false

      const { count } = await supabase
        .from('forecast_user_forecasts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_current', true)
        .in('question_id', questionIds.map(q => q.id))
      return (count ?? 0) >= (rule.threshold as number)
    }

    case 'streak': {
      const { data: streak } = await supabase
        .from('streak_states')
        .select('longest_count')
        .eq('user_id', userId)
        .eq('streak_type', rule.streak_type as string)
        .single()
      return (streak?.longest_count ?? 0) >= (rule.threshold as number)
    }

    case 'leaderboard_rank': {
      const { data: snapshot } = await supabase
        .from('leaderboard_snapshots')
        .select('rank')
        .eq('user_id', userId)
        .eq('period_type', rule.period as string)
        .is('category', null)
        .order('snapshot_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return snapshot !== null && snapshot.rank <= (rule.max_rank as number)
    }

    case 'contrarian_win': {
      const { count } = await supabase
        .from('reward_points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('action', 'contrarian_win')
      return (count ?? 0) >= (rule.threshold as number)
    }

    case 'early_forecast': {
      const { count } = await supabase
        .from('reward_points_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('action', 'early_forecast')
      return (count ?? 0) >= (rule.threshold as number)
    }

    case 'most_improved': {
      // Compare current avg brier with the avg from 30 days ago
      const { data: recentScores } = await supabase
        .from('forecast_brier_scores')
        .select('brier_score, scored_at')
        .eq('user_id', userId)
        .order('scored_at', { ascending: false })

      if (!recentScores || recentScores.length < 10) return false

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const oldScores = recentScores.filter(s => s.scored_at < thirtyDaysAgo)
      const newScores = recentScores.filter(s => s.scored_at >= thirtyDaysAgo)

      if (oldScores.length < 5 || newScores.length < 5) return false

      const oldAvg = oldScores.reduce((s, r) => s + r.brier_score, 0) / oldScores.length
      const newAvg = newScores.reduce((s, r) => s + r.brier_score, 0) / newScores.length
      // Improvement: Brier dropped by at least 0.10 (lower is better)
      return (oldAvg - newAvg) >= 0.10
    }

    case 'profile_complete': {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, company, job_title, avatar_url')
        .eq('id', userId)
        .single()
      if (!profile) return false
      return !!(profile.full_name && profile.company && profile.job_title)
    }

    default:
      return false
  }
}
