import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BASE_POINTS, MULTIPLIERS, TIER_THRESHOLDS, TIER_ORDER,
  xpToLevel,
  type Tier, type PointAction,
} from './types'

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

  // Check for promotion
  for (let i = TIER_ORDER.length - 1; i > currentIdx; i--) {
    const candidate = TIER_ORDER[i]
    const req = TIER_THRESHOLDS[candidate]
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

      await supabase.from('reward_notifications').insert({
        user_id: userId,
        type: 'tier_promoted',
        title: `Promotion au rang ${candidate.charAt(0).toUpperCase() + candidate.slice(1)}`,
        body: `Felicitations ! Vous etes maintenant ${candidate}.`,
        data: { old_tier: currentTier, new_tier: candidate },
      })

      break
    }
  }
}
