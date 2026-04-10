/**
 * resolution-scoring.job.ts
 *
 * Consumed when `forecast.resolution.ready` is dequeued.
 *
 * Pipeline :
 *   1. Validate outcome (resolved_yes / resolved_no)
 *   2. Fetch all current user forecasts for the question
 *   3. Calculate Brier score for each user  → (p - o)²
 *   4. Upsert into forecast_brier_scores
 *   5. Refresh leaderboard entries for affected users
 */

import { createWorkerSupabase } from '../../supabase'

interface ResolutionPayload {
  questionId: string
  outcome: 'resolved_yes' | 'resolved_no' | 'annulled'
  resolvedBy?: string
}

export async function runResolutionScoringJob(payload: ResolutionPayload): Promise<void> {
  const { questionId, outcome } = payload

  if (outcome === 'annulled') {
    console.log(`[resolution-scoring] Question ${questionId} annulée — pas de scoring.`)
    return
  }

  const outcomeNumeric = outcome === 'resolved_yes' ? 1 : 0
  const supabase = createWorkerSupabase()

  // 1. Load question to confirm status
  const { data: question, error: qErr } = await supabase
    .from('forecast_questions')
    .select('id, status, title')
    .eq('id', questionId)
    .single()

  if (qErr || !question) {
    throw new Error(`Question ${questionId} introuvable : ${qErr?.message}`)
  }

  const isResolved = ['resolved_yes', 'resolved_no'].includes(question.status)
  if (!isResolved) {
    throw new Error(`Question ${questionId} n'est pas encore résolue (status: ${question.status})`)
  }

  // 2. Fetch all user forecasts (last submitted before resolution)
  const { data: forecasts, error: fErr } = await supabase
    .from('forecast_user_forecasts')
    .select('id, user_id, probability, revision')
    .eq('question_id', questionId)
    .eq('is_current', true)

  if (fErr) throw new Error(`Erreur fetch forecasts : ${fErr.message}`)
  if (!forecasts?.length) {
    console.log(`[resolution-scoring] Aucun forecast utilisateur pour ${questionId} — skip.`)
    return
  }

  console.log(`[resolution-scoring] ${forecasts.length} forecasts à scorer pour "${question.title?.slice(0, 50)}"`)

  // 3. Calculate Brier scores
  const brierRows = forecasts.map(f => {
    const p = f.probability                         // 0–1
    const o = outcomeNumeric                        // 0 or 1
    const brierScore = Math.pow(p - o, 2)           // Brier = (p - o)²

    return {
      question_id:    questionId,
      user_id:        f.user_id,
      submitted_prob: p,
      outcome:        outcomeNumeric,
      brier_score:    Math.round(brierScore * 10000) / 10000, // 4 decimal places
      revision:       f.revision,
      scored_at:      new Date().toISOString(),
    }
  })

  // 4. Upsert brier scores (idempotent on question_id + user_id)
  const { error: upsertErr } = await supabase
    .from('forecast_brier_scores')
    .upsert(brierRows, { onConflict: 'question_id,user_id' })

  if (upsertErr) throw new Error(`Upsert brier scores échoué : ${upsertErr.message}`)

  console.log(`[resolution-scoring] ${brierRows.length} scores Brier persistés.`)

  // 5. Refresh leaderboard for each affected user
  const seen = new Set<string>()
  const affectedUserIds: string[] = []
  for (const f of forecasts) {
    if (!seen.has(f.user_id)) { seen.add(f.user_id); affectedUserIds.push(f.user_id) }
  }
  await refreshLeaderboardForUsers(supabase, affectedUserIds)

  console.log(`[resolution-scoring] Leaderboard mis à jour pour ${affectedUserIds.length} users.`)
}

async function refreshLeaderboardForUsers(
  supabase: ReturnType<typeof createWorkerSupabase>,
  userIds: string[],
) {
  // For each user: aggregate their brier scores
  for (const userId of userIds) {
    const { data: scores, error } = await supabase
      .from('forecast_brier_scores')
      .select('brier_score')
      .eq('user_id', userId)

    if (error || !scores?.length) continue

    const total            = scores.length
    const avgBrier         = scores.reduce((sum, s) => sum + s.brier_score, 0) / total
    const goodPredictions  = scores.filter(s => s.brier_score < 0.25).length
    const accuracyPct      = total > 0 ? Math.round((goodPredictions / total) * 100) : 0

    // Fetch display name from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()

    const displayName = (profile as any)?.full_name ?? 'Anonyme'

    await supabase
      .from('forecast_leaderboard')
      .upsert({
        user_id:          userId,
        display_name:     displayName,
        avg_brier_score:  Math.round(avgBrier * 10000) / 10000,
        questions_scored: total,
        good_predictions: goodPredictions,
        accuracy_pct:     accuracyPct,
        last_updated:     new Date().toISOString(),
      }, { onConflict: 'user_id' })
  }

  // Recompute ranks (order by avg_brier_score asc)
  const { data: all } = await supabase
    .from('forecast_leaderboard')
    .select('user_id, avg_brier_score')
    .order('avg_brier_score', { ascending: true })
    .not('avg_brier_score', 'is', null)

  if (all?.length) {
    const rankUpdates = all.map((row, i) => ({
      user_id: row.user_id,
      rank: i + 1,
    }))
    for (const upd of rankUpdates) {
      await supabase
        .from('forecast_leaderboard')
        .update({ rank: upd.rank })
        .eq('user_id', upd.user_id)
    }
  }
}
