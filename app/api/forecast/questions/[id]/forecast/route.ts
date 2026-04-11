import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishForecastEvent } from '@/lib/forecast/queue/publisher'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const db = createAdminClient()

  const { data: question } = await db
    .from('forecast_questions')
    .select('id, status, question_type')
    .eq('id', params.id)
    .single()

  if (!question) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 })
  if (question.status !== 'open') return NextResponse.json({ error: 'Question non ouverte' }, { status: 409 })

  // Multi-choice vote path
  if (Array.isArray(body.outcomes)) {
    return handleMultiChoiceVote(db, params.id, user.id, body.outcomes)
  }

  // Binary vote path
  const { probability, reasoning } = body

  if (typeof probability !== 'number' || probability < 0 || probability > 1) {
    return NextResponse.json({ error: 'probability doit être un float entre 0 et 1' }, { status: 400 })
  }

  const { data: prev } = await db
    .from('forecast_user_forecasts')
    .select('id, revision')
    .eq('question_id', params.id)
    .eq('user_id', user.id)
    .eq('is_current', true)
    .maybeSingle()

  const revision = (prev?.revision ?? 0) + 1

  if (prev) {
    await db.from('forecast_user_forecasts').update({ is_current: false }).eq('id', prev.id)
  }

  const { data: forecast, error } = await db
    .from('forecast_user_forecasts')
    .insert({ question_id: params.id, user_id: user.id, probability, reasoning: reasoning ?? null, revision, is_current: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await publishForecastEvent({
    type: 'forecast.user.forecast.submitted',
    correlationId: params.id,
    payload: { questionId: params.id, userId: user.id, probability, revision, hasReasoning: !!reasoning },
  })
  await publishForecastEvent({
    type: 'forecast.blended.recompute.requested',
    correlationId: params.id,
    payload: { questionId: params.id, reason: 'user_forecast' as const },
  })

  // Reward engine: points, streaks, badges (fire-and-forget)
  processSubmissionRewards(db, user.id, revision, !!reasoning).catch(() => {})

  return NextResponse.json({ forecast }, { status: 201 })
}

async function processSubmissionRewards(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  revision: number,
  hasReasoning: boolean,
) {
  try {
    const { ensureRewardProfile, awardPoints } = await import('@/lib/rewards/scoring')
    const { updateStreak } = await import('@/lib/rewards/streaks')
    const { checkAndAwardBadges } = await import('@/lib/rewards/badges')

    await ensureRewardProfile(db, userId)

    const isNewForecast = revision === 1
    if (isNewForecast) {
      await awardPoints(db, userId, 'forecast_submitted')
      await updateStreak(db, userId, 'daily_forecast')
    } else {
      await awardPoints(db, userId, 'forecast_updated')
      await updateStreak(db, userId, 'update_streak')
    }

    if (hasReasoning) {
      await awardPoints(db, userId, 'reasoning_submitted')
    }

    await checkAndAwardBadges(db, userId, { action: 'forecast_submit' })
  } catch (e) {
    console.error('[forecast/route] Reward processing failed (non-blocking):', e instanceof Error ? e.message : e)
  }
}

async function handleMultiChoiceVote(
  db: ReturnType<typeof createAdminClient>,
  questionId: string,
  userId: string,
  outcomes: { outcome_id: string; probability: number }[],
) {
  if (!outcomes.length) {
    return NextResponse.json({ error: 'outcomes vide' }, { status: 400 })
  }

  const sum = outcomes.reduce((s, o) => s + (o.probability ?? 0), 0)
  if (Math.abs(sum - 1) > 0.05) {
    return NextResponse.json({ error: `La somme des probabilités doit être ~1.0 (reçu: ${sum.toFixed(3)})` }, { status: 400 })
  }

  for (const o of outcomes) {
    if (typeof o.probability !== 'number' || o.probability < 0 || o.probability > 1) {
      return NextResponse.json({ error: 'Chaque probability doit être entre 0 et 1' }, { status: 400 })
    }
  }

  // Archive previous votes for this question
  await db
    .from('forecast_user_outcome_votes')
    .update({ is_current: false })
    .eq('question_id', questionId)
    .eq('user_id', userId)
    .eq('is_current', true)

  // Get next revision
  const { count } = await db
    .from('forecast_user_outcome_votes')
    .select('id', { count: 'exact', head: true })
    .eq('question_id', questionId)
    .eq('user_id', userId)

  const revision = Math.floor(((count ?? 0) / Math.max(1, outcomes.length))) + 1

  const rows = outcomes.map(o => ({
    outcome_id: o.outcome_id,
    question_id: questionId,
    user_id: userId,
    probability: o.probability,
    revision,
    is_current: true,
  }))

  const { error } = await db.from('forecast_user_outcome_votes').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also increment forecast_count on the question
  await db.rpc('increment_forecast_count', { qid: questionId }).catch(() => {
    // Fallback if RPC doesn't exist
    db.from('forecast_questions')
      .update({ forecast_count: (db as any).sql`forecast_count + 1` })
      .eq('id', questionId)
  })

  await publishForecastEvent({
    type: 'forecast.blended.recompute.requested',
    correlationId: questionId,
    payload: { questionId, reason: 'user_forecast' as const },
  })

  // Reward engine for multi-choice votes
  processSubmissionRewards(db, userId, revision, false).catch(() => {})

  return NextResponse.json({ ok: true, revision }, { status: 201 })
}
