import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BASE_POINTS, MULTIPLIERS, TIER_THRESHOLDS_FALLBACK, TIER_ORDER,
  xpToLevel,
  type Tier, type PointAction, type TierDefinition,
} from './types'

async function loadTierThresholds(
  supabase: SupabaseClient,
): Promise<Record<string, { minXP: number; minQuestions: number; proDaysReward: number }>> {
  const { data } = await supabase
    .from('tier_definitions')
    .select('slug, min_xp, min_questions, pro_days_reward')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (!data?.length) return TIER_THRESHOLDS_FALLBACK

  const map: Record<string, { minXP: number; minQuestions: number; proDaysReward: number }> = {}
  for (const t of data) {
    map[t.slug] = { minXP: t.min_xp, minQuestions: t.min_questions, proDaysReward: t.pro_days_reward }
  }
  return map
}

export async function ensureRewardProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('user_reward_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) {
    await supabase.from('user_reward_profiles').insert({ user_id: userId })
  }
}

export async function awardPoints(
  supabase: SupabaseClient,
  userId: string,
  action: PointAction,
  opts: {
    baseOverride?: number
    multiplier?: number
    referenceId?: string
    referenceType?: string
    details?: Record<string, unknown>
  } = {},
): Promise<number> {
  await ensureRewardProfile(supabase, userId)

  const base = opts.baseOverride ?? BASE_POINTS[action] ?? 0
  const multiplier = opts.multiplier ?? 1.0
  const finalPoints = Math.round(base * multiplier)

  if (finalPoints <= 0) return 0

  await supabase.from('reward_points_ledger').insert({
    user_id: userId,
    action,
    points: base,
    multiplier,
    final_points: finalPoints,
    reference_id: opts.referenceId ?? null,
    reference_type: opts.referenceType ?? null,
    details: opts.details ?? {},
  })

  // Update profile XP
  const { data: profile } = await supabase
    .from('user_reward_profiles')
    .select('total_xp, forecasts_submitted, questions_resolved')
    .eq('user_id', userId)
    .single()

  if (profile) {
    const newXP = (profile.total_xp ?? 0) + finalPoints
    const newLevel = xpToLevel(newXP)

    const updates: Record<string, unknown> = {
      total_xp: newXP,
      level: newLevel,
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    if (action === 'forecast_submitted') {
      updates.forecasts_submitted = (profile.forecasts_submitted ?? 0) + 1
      updates.last_forecast_at = new Date().toISOString()
    }
    if (action === 'question_resolved_accurate' || action === 'question_resolved_inaccurate') {
      updates.questions_resolved = (profile.questions_resolved ?? 0) + 1
    }

    await supabase
      .from('user_reward_profiles')
      .update(updates)
      .eq('user_id', userId)

    // Check tier promotion
    await checkTierPromotion(supabase, userId, newXP, (profile.questions_resolved ?? 0) + (action.includes('resolved') ? 1 : 0))
  }

  return finalPoints
}

export function brierToMultiplier(brier: number): number {
  if (brier < 0.05) return MULTIPLIERS.BRIER_EXCELLENT
  if (brier < 0.15) return MULTIPLIERS.BRIER_GOOD
  if (brier < 0.25) return MULTIPLIERS.BRIER_DECENT
  return MULTIPLIERS.BRIER_POOR
}

export async function awardResolutionPoints(
  supabase: SupabaseClient,
  userId: string,
  brierScore: number,
  questionId: string,
  opts: { isEarly?: boolean; isContrarian?: boolean; participantCount?: number } = {},
) {
  const isAccurate = brierScore < 0.25
  const action = isAccurate ? 'question_resolved_accurate' : 'question_resolved_inaccurate'
  let multiplier = brierToMultiplier(brierScore)

  if (opts.isEarly) multiplier *= MULTIPLIERS.EARLY_24H
  if (opts.participantCount && opts.participantCount >= 10) multiplier *= MULTIPLIERS.HIGH_PARTICIPATION_Q

  await awardPoints(supabase, userId, action as PointAction, {
    multiplier,
    referenceId: questionId,
    referenceType: 'forecast_question',
    details: { brier_score: brierScore, is_early: opts.isEarly, is_contrarian: opts.isContrarian },
  })

  if (opts.isEarly && isAccurate) {
    await awardPoints(supabase, userId, 'early_forecast', {
      referenceId: questionId,
      referenceType: 'forecast_question',
      details: { brier_score: brierScore },
    })
  }

  if (opts.isContrarian && isAccurate) {
    await awardPoints(supabase, userId, 'contrarian_win', {
      referenceId: questionId,
      referenceType: 'forecast_question',
    })
  }
}

async function checkTierPromotion(
  supabase: SupabaseClient,
  userId: string,
  totalXP: number,
  questionsResolved: number,
) {
  const { data: profile } = await supabase
    .from('user_reward_profiles')
    .select('tier')
    .eq('user_id', userId)
    .single()

  if (!profile) return

  const currentTier = profile.tier as Tier
  const currentIdx = TIER_ORDER.indexOf(currentTier)

  const thresholds = await loadTierThresholds(supabase)

  for (let i = TIER_ORDER.length - 1; i > currentIdx; i--) {
    const candidate = TIER_ORDER[i]
    const req = thresholds[candidate] ?? TIER_THRESHOLDS_FALLBACK[candidate]
    if (!req) continue
    if (totalXP >= req.minXP && questionsResolved >= req.minQuestions) {
      await supabase.from('user_reward_profiles').update({
        tier: candidate,
        tier_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)

      await supabase.from('tier_memberships').insert({
        user_id: userId,
        tier: candidate,
      })

      // Grant Pro days from tier config
      if (req.proDaysReward > 0) {
        const { grantProDays } = await import('./pro-grants')
        await grantProDays(supabase, userId, req.proDaysReward, `Promotion au tier ${candidate}`, `tier_${candidate}`)
      }

      // Fetch tier name for notification
      const { data: tierDef } = await supabase
        .from('tier_definitions')
        .select('name_fr')
        .eq('slug', candidate)
        .single()

      const label = tierDef?.name_fr ?? (candidate.charAt(0).toUpperCase() + candidate.slice(1))

      await supabase.from('reward_notifications').insert({
        user_id: userId,
        type: 'tier_promoted',
        title: `Promotion au rang ${label}`,
        body: `Felicitations ! Vous etes maintenant ${label}.`,
        data: { old_tier: currentTier, new_tier: candidate },
      })

      break
    }
  }
}
