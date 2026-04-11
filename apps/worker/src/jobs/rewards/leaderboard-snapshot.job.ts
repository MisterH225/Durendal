/**
 * leaderboard-snapshot.job.ts
 *
 * Takes periodic snapshots of the leaderboard for weekly/monthly rankings.
 * Awards Pro days and badges to top performers.
 * Runs once per day at minimum; weekly and monthly processing on boundaries.
 */

import { createWorkerSupabase } from '../../supabase'
import { grantLeaderboardRewards } from '../../../../lib/rewards/pro-grants'
import { checkAndAwardBadges } from '../../../../lib/rewards/badges'

export async function runLeaderboardSnapshotJob(): Promise<void> {
  const supabase = createWorkerSupabase()
  const now = new Date()
  const dayOfWeek = now.getUTCDay()
  const dayOfMonth = now.getUTCDate()

  // Always take a daily snapshot for the current week
  const weekKey = getWeekKey(now)
  await takeSnapshot(supabase, 'weekly', weekKey)
  console.log(`[leaderboard-snapshot] Snapshot hebdo ${weekKey} pris.`)

  // On Mondays: finalize previous week and grant rewards
  if (dayOfWeek === 1) {
    const prevWeek = getWeekKey(new Date(now.getTime() - 7 * 86_400_000))
    await grantLeaderboardRewards(supabase, 'weekly', prevWeek)
    console.log(`[leaderboard-snapshot] Récompenses semaine ${prevWeek} attribuées.`)
  }

  // On 1st of month: finalize previous month
  if (dayOfMonth === 1) {
    const prevMonth = getMonthKey(new Date(now.getTime() - 86_400_000))
    await takeSnapshot(supabase, 'monthly', prevMonth)
    await grantLeaderboardRewards(supabase, 'monthly', prevMonth)

    // Award prestige badges for top monthly performers
    await awardLeaderboardBadges(supabase, 'monthly', prevMonth)
    console.log(`[leaderboard-snapshot] Récompenses mois ${prevMonth} attribuées.`)
  }

  // On April 1, July 1, Oct 1, Jan 1: finalize previous quarter
  if (dayOfMonth === 1 && [0, 3, 6, 9].includes(now.getUTCMonth())) {
    const prevQ = getQuarterKey(new Date(now.getTime() - 86_400_000))
    await takeSnapshot(supabase, 'quarterly', prevQ)
    await grantLeaderboardRewards(supabase, 'quarterly', prevQ)
    console.log(`[leaderboard-snapshot] Récompenses trimestre ${prevQ} attribuées.`)
  }
}

async function takeSnapshot(
  supabase: ReturnType<typeof createWorkerSupabase>,
  periodType: 'weekly' | 'monthly' | 'quarterly',
  periodKey: string,
) {
  // Get current leaderboard
  const { data: lb } = await supabase
    .from('forecast_leaderboard')
    .select('user_id, avg_brier_score, questions_scored, good_predictions, accuracy_pct, rank')
    .not('avg_brier_score', 'is', null)
    .gte('questions_scored', 1)
    .order('avg_brier_score', { ascending: true })
    .limit(100)

  if (!lb?.length) return

  const rows = lb.map((entry, idx) => ({
    period_type: periodType,
    period_key: periodKey,
    category: null as string | null,
    user_id: entry.user_id,
    rank: idx + 1,
    score: entry.avg_brier_score,
    questions_scored: entry.questions_scored,
    accuracy_pct: entry.accuracy_pct,
    data: { good_predictions: entry.good_predictions },
    snapshot_at: new Date().toISOString(),
  }))

  // Upsert to avoid duplicates for the same period
  for (const row of rows) {
    await supabase.from('leaderboard_snapshots').upsert(row, {
      onConflict: 'period_type,period_key,user_id',
      ignoreDuplicates: false,
    })
  }
}

async function awardLeaderboardBadges(
  supabase: ReturnType<typeof createWorkerSupabase>,
  periodType: string,
  periodKey: string,
) {
  const { data: top } = await supabase
    .from('leaderboard_snapshots')
    .select('user_id')
    .eq('period_type', periodType)
    .eq('period_key', periodKey)
    .is('category', null)
    .order('rank', { ascending: true })
    .limit(10)

  if (!top?.length) return

  for (const entry of top) {
    await checkAndAwardBadges(supabase, entry.user_id, {
      action: 'leaderboard_rank',
    })
  }
}

function getWeekKey(d: Date): string {
  const year = d.getUTCFullYear()
  const jan1 = new Date(Date.UTC(year, 0, 1))
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86_400_000)
  const week = Math.ceil((days + jan1.getUTCDay() + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

function getMonthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function getQuarterKey(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${d.getUTCFullYear()}-Q${q}`
}
