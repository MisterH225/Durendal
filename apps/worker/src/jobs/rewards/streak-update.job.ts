/**
 * streak-update.job.ts
 *
 * Scheduled job that checks for expired streaks and sends
 * at-risk notifications. Runs every 30 minutes.
 */

import { createWorkerSupabase } from '../../supabase'
import { checkExpiredStreaks } from '../../../../lib/rewards/streaks'
import { expireFeatureUnlocks } from '../../../../lib/rewards/pro-grants'

export async function runStreakUpdateJob(): Promise<void> {
  const supabase = createWorkerSupabase()

  // 1. Check and reset expired streaks (sends at-risk warnings during grace)
  const resetCount = await checkExpiredStreaks(supabase)
  if (resetCount > 0) {
    console.log(`[streak-update] ${resetCount} streak(s) réinitialisée(s).`)
  }

  // 2. Expire any temporary feature unlocks past their expiry date
  const expiredUnlocks = await expireFeatureUnlocks(supabase)
  if (expiredUnlocks > 0) {
    console.log(`[streak-update] ${expiredUnlocks} feature unlock(s) expiré(s).`)
  }
}
