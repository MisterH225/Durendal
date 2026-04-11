import type { SupabaseClient } from '@supabase/supabase-js'
import { STREAK_CONFIG, type StreakType } from './types'
import { awardPoints } from './scoring'

export async function updateStreak(
  supabase: SupabaseClient,
  userId: string,
  streakType: StreakType,
): Promise<{ newCount: number; isMilestone: boolean }> {
  const config = STREAK_CONFIG[streakType]
  const now = new Date()

  const { data: existing } = await supabase
    .from('streak_states')
    .select('*')
    .eq('user_id', userId)
    .eq('streak_type', streakType)
    .maybeSingle()

  if (!existing) {
    // First action ever for this streak type
    const expiresAt = config.windowHours > 0
      ? new Date(now.getTime() + config.windowHours * 60 * 60 * 1000).toISOString()
      : null

    await supabase.from('streak_states').insert({
      user_id: userId,
      streak_type: streakType,
      current_count: 1,
      longest_count: 1,
      last_action_at: now.toISOString(),
      expires_at: expiresAt,
    })

    return { newCount: 1, isMilestone: false }
  }

  // Check if this is a same-day action (no double counting)
  if (existing.last_action_at) {
    const lastAction = new Date(existing.last_action_at)
    const sameDay = lastAction.toDateString() === now.toDateString()
    if (sameDay && streakType === 'daily_forecast') {
      return { newCount: existing.current_count, isMilestone: false }
    }
  }

  let newCount = existing.current_count + 1
  const expiresAt = config.windowHours > 0
    ? new Date(now.getTime() + config.windowHours * 60 * 60 * 1000).toISOString()
    : null

  const newLongest = Math.max(existing.longest_count, newCount)

  await supabase.from('streak_states').update({
    current_count: newCount,
    longest_count: newLongest,
    last_action_at: now.toISOString(),
    grace_used: false,
    expires_at: expiresAt,
    updated_at: now.toISOString(),
  }).eq('id', existing.id)

  // Update reward profile
  await supabase.from('user_reward_profiles').update({
    current_streak: newCount,
    longest_streak: newLongest,
    updated_at: now.toISOString(),
  }).eq('user_id', userId)

  // Check milestones
  const milestones = [7, 14, 30, 60, 90, 180, 365]
  const isMilestone = milestones.includes(newCount)

  if (isMilestone) {
    let bonusPoints = 0
    if (newCount >= 90) bonusPoints = 100
    else if (newCount >= 30) bonusPoints = 50
    else if (newCount >= 14) bonusPoints = 20
    else if (newCount >= 7) bonusPoints = 10

    if (bonusPoints > 0) {
      await awardPoints(supabase, userId, 'streak_bonus', {
        baseOverride: bonusPoints,
        details: { streak_type: streakType, streak_count: newCount },
      })
    }

    await supabase.from('reward_notifications').insert({
      user_id: userId,
      type: 'streak_milestone',
      title: `Serie de ${newCount} jours !`,
      body: `Vous maintenez une serie de ${newCount} jours de previsions consecutives. ${bonusPoints > 0 ? `+${bonusPoints} XP bonus !` : ''}`,
      data: { streak_type: streakType, count: newCount, bonus_points: bonusPoints },
    })
  }

  return { newCount, isMilestone }
}

export async function checkExpiredStreaks(supabase: SupabaseClient): Promise<number> {
  const now = new Date().toISOString()

  // Find expired streaks
  const { data: expired } = await supabase
    .from('streak_states')
    .select('*')
    .gt('current_count', 0)
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
    .limit(100)

  if (!expired?.length) return 0

  let reset = 0
  for (const streak of expired) {
    const config = STREAK_CONFIG[streak.streak_type as StreakType]

    // Check grace period
    if (!streak.grace_used && config.graceHours > 0) {
      const graceEnd = new Date(new Date(streak.expires_at!).getTime() + config.graceHours * 60 * 60 * 1000)
      if (new Date() < graceEnd) {
        // Within grace: send warning but don't reset
        await supabase.from('reward_notifications').insert({
          user_id: streak.user_id,
          type: 'streak_at_risk',
          title: `Serie en danger !`,
          body: `Votre serie de ${streak.current_count} jours risque d'etre perdue. Soumettez une prevision avant minuit.`,
          data: { streak_type: streak.streak_type, count: streak.current_count },
        })
        await supabase.from('streak_states').update({
          grace_used: true,
          updated_at: new Date().toISOString(),
        }).eq('id', streak.id)
        continue
      }
    }

    // Reset streak
    await supabase.from('streak_states').update({
      current_count: 0,
      grace_used: false,
      expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', streak.id)

    await supabase.from('user_reward_profiles').update({
      current_streak: 0,
      updated_at: new Date().toISOString(),
    }).eq('user_id', streak.user_id)

    reset++
  }

  return reset
}
