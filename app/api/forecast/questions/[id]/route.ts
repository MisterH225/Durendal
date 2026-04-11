import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createAdminClient()

  const { data: question, error } = await db
    .from('forecast_questions')
    .select(`
      *,
      forecast_channels ( id, slug, name ),
      forecast_events   ( id, slug, title ),
      forecast_ai_forecasts ( probability, confidence, model, reasoning, created_at )
    `)
    .or(`id.eq.${params.id},slug.eq.${params.id}`)
    .eq('forecast_ai_forecasts.is_current', true)
    .neq('status', 'draft')
    .neq('status', 'paused')
    .maybeSingle()

  if (!question || error) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 })

  const { data: history } = await db
    .from('forecast_probability_history')
    .select('snapshot_at, crowd_probability, ai_probability, blended_probability')
    .eq('question_id', question.id)
    .order('snapshot_at', { ascending: true })
    .limit(60)

  return NextResponse.json({ question, history: history ?? [] })
}
