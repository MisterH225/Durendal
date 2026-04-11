import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createAdminClient()
  const raw = params.id
  const isUuid = UUID_RE.test(raw)

  let q = db
    .from('forecast_questions')
    .select('*, forecast_channels ( id, slug, name ), forecast_events ( id, slug, title )')
    .neq('status', 'draft')
    .neq('status', 'paused')

  q = isUuid ? q.or(`id.eq.${raw},slug.eq.${raw}`) : q.eq('slug', raw)

  const { data: question, error } = await q.maybeSingle()

  if (!question || error) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 })

  const { data: aiForecast } = await db
    .from('forecast_ai_forecasts')
    .select('probability, confidence, model, reasoning, created_at')
    .eq('question_id', question.id)
    .eq('is_current', true)
    .maybeSingle()

  const questionOut = {
    ...question,
    forecast_ai_forecasts: aiForecast ? [aiForecast] : [],
  }

  const { data: history } = await db
    .from('forecast_probability_history')
    .select('snapshot_at, crowd_probability, ai_probability, blended_probability')
    .eq('question_id', question.id)
    .order('snapshot_at', { ascending: true })
    .limit(60)

  return NextResponse.json({ question: questionOut, history: history ?? [] })
}
