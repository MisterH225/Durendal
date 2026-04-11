import type { SupabaseClient } from '@supabase/supabase-js'
import { PRO_REWARD_RULES } from './types'

export async function grantProDays(
  supabase: SupabaseClient,
  userId: string,
  days: number,
  reason: string,
  sourceRef?: string,
) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  // Check if user already has an active pro_access unlock
  const { data: existing } = await supabase
    .from('feature_unlocks')
    .select('id, expires_at')
    .eq('user_id', userId)
    .eq('feature', 'pro_access')
    .eq('is_active', true)
    .gte('expires_at', now.toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let finalExpiry = expiresAt
  if (existing?.expires_at) {
    // Extend the existing expiry
    finalExpiry = new Date(new Date(existing.expires_at).getTime() + days * 24 * 60 * 60 * 1000)
  }

  if (existing) {
    await supabase.from('feature_unlocks').update({
      expires_at: finalExpiry.toISOString(),
    }).eq('id', existing.id)
  } else {
    await supabase.from('feature_unlocks').insert({
      user_id: userId,
      feature: 'pro_access',
      granted_at: now.toISOString(),
      expires_at: finalExpiry.toISOString(),
      source: 'reward',
      source_ref: sourceRef ?? reason,
    })
  }

  // Update reward profile
  await supabase.from('user_reward_profiles').update({
    pro_days_earned: (await getProDaysEarned(supabase, userId)) + days,
    updated_at: now.toISOString(),
  }).eq('user_id', userId)

  // Notification
  await supabase.from('reward_notifications').insert({
    user_id: userId,
    type: 'pro_days_granted',
    title: `${days} jours Pro offerts !`,
    body: `Vous avez gagne ${days} jours d'acces Pro Veille Concurrentielle. Raison : ${reason}`,
    data: { days, reason, expires_at: finalExpiry.toISOString() },
  })
}

async function getProDaysEarned(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('user_reward_profiles')
    .select('pro_days_earned')
    .eq('user_id', userId)
    .single()
  return data?.pro_days_earned ?? 0
}

export async function grantLeaderboardRewards(
  supabase: SupabaseClient,
  periodType: 'weekly' | 'monthly' | 'quarterly',
  periodKey: string,
) {
  const { data: top } = await supabase
    .from('leaderboard_snapshots')
    .select('user_id, rank')
    .eq('period_type', periodType)
    .eq('period_key', periodKey)
    .is('category', null)
    .order('rank', { ascending: true })
    .limit(10)

  if (!top?.length) return

  for (const entry of top) {
    let days = 0
    let reason = ''

    if (periodType === 'monthly') {
      if (entry.rank === 1) {
        days = PRO_REWARD_RULES.MONTHLY_CHAMPION.days
        reason = `Champion du mois ${periodKey}`
      } else if (entry.rank <= 3) {
        days = PRO_REWARD_RULES.MONTHLY_TOP_3.days
        reason = `Top 3 mensuel ${periodKey}`
      } else if (entry.rank <= 10) {
        days = PRO_REWARD_RULES.MONTHLY_TOP_10.days
        reason = `Top 10 mensuel ${periodKey}`
      }
    } else if (periodType === 'quarterly') {
      if (entry.rank <= 10) {
        days = PRO_REWARD_RULES.QUARTERLY_TOP_10.days
        reason = `Top 10 trimestriel ${periodKey}`
      }
    }

    if (days > 0) {
      await grantProDays(supabase, entry.user_id, days, reason, `leaderboard_${periodType}_${periodKey}`)
    }
  }
}

export async function grantTierReward(
  supabase: SupabaseClient,
  userId: string,
  tier: string,
) {
  // Load pro_days_reward from DB
  const { data: tierDef } = await supabase
    .from('tier_definitions')
    .select('pro_days_reward, name_fr')
    .eq('slug', tier)
    .eq('is_active', true)
    .single()

  const days = tierDef?.pro_days_reward ?? 0
  if (days > 0) {
    const label = tierDef?.name_fr ?? tier
    await grantProDays(supabase, userId, days, `Promotion au tier ${label}`, `tier_${tier}`)
  }
}

export async function expireFeatureUnlocks(supabase: SupabaseClient): Promise<number> {
  const now = new Date().toISOString()

  const { data: expired } = await supabase
    .from('feature_unlocks')
    .select('id, user_id, feature')
    .eq('is_active', true)
    .lt('expires_at', now)
    .limit(200)

  if (!expired?.length) return 0

  for (const unlock of expired) {
    await supabase.from('feature_unlocks').update({
      is_active: false,
    }).eq('id', unlock.id)
  }

  return expired.length
}

export async function hasActiveProAccess(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('feature_unlocks')
    .select('id')
    .eq('user_id', userId)
    .eq('feature', 'pro_access')
    .eq('is_active', true)
    .gte('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  return data !== null
}
