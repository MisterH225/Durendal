import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishForecastEvent } from '@/lib/forecast/queue/publisher'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { probability, reasoning } = body

  if (typeof probability !== 'number' || probability < 0 || probability > 1) {
    return NextResponse.json({ error: 'probability doit être un float entre 0 et 1' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: question } = await db
    .from('forecast_questions')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (!question) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 })
  if (question.status !== 'open') return NextResponse.json({ error: 'Question non ouverte' }, { status: 409 })

  // Get current revision
  const { data: prev } = await db
    .from('forecast_user_forecasts')
    .select('id, revision')
    .eq('question_id', params.id)
    .eq('user_id', user.id)
    .eq('is_current', true)
    .maybeSingle()

  const revision = (prev?.revision ?? 0) + 1

  // Archive previous
  if (prev) {
    await db.from('forecast_user_forecasts').update({ is_current: false }).eq('id', prev.id)
  }

  // Insert new
  const { data: forecast, error } = await db
    .from('forecast_user_forecasts')
    .insert({ question_id: params.id, user_id: user.id, probability, reasoning: reasoning ?? null, revision, is_current: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Queue events
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

  return NextResponse.json({ forecast }, { status: 201 })
}
