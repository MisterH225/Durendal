/**
 * reward-process.job.ts
 *
 * Triggered after resolution scoring completes for each user.
 * Awards XP points for resolution, checks badge eligibility,
 * updates streaks, and evaluates tier promotion.
 */

import { createWorkerSupabase } from '../../supabase'
import { awardResolutionPoints } from '../../../../../lib/rewards/scoring'
import { checkAndAwardBadges } from '../../../../../lib/rewards/badges'

interface RewardPayload {
  questionId: string
  userId: string
  brierScore: number
  isEarly?: boolean
  isContrarian?: boolean
  participantCount?: number
}

export async function runRewardProcessJob(payload: RewardPayload): Promise<void> {
  const { questionId, userId, brierScore, isEarly, isContrarian, participantCount } = payload
  const supabase = createWorkerSupabase()

  console.log(`[reward-process] Processing rewards for user ${userId} on question ${questionId} (brier: ${brierScore})`)

  // Award XP for resolution
  await awardResolutionPoints(supabase, userId, brierScore, questionId, {
    isEarly,
    isContrarian,
    participantCount,
  })

  // Update avg_brier_score on reward profile
  const { data: scores } = await supabase
    .from('forecast_brier_scores')
    .select('brier_score')
    .eq('user_id', userId)

  if (scores?.length) {
    const avg = scores.reduce((s, r) => s + r.brier_score, 0) / scores.length
    await supabase.from('user_reward_profiles').update({
      avg_brier_score: Math.round(avg * 10000) / 10000,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
  }

  // Check badges
  const awarded = await checkAndAwardBadges(supabase, userId, {
    action: 'resolution',
    questionId,
  })

  if (awarded.length > 0) {
    console.log(`[reward-process] Badges awarded to ${userId}: ${awarded.join(', ')}`)
  }

  console.log(`[reward-process] Done for user ${userId}.`)
}
