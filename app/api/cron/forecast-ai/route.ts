/**
 * GET /api/cron/forecast-ai
 *
 * Déclenche une estimation IA pour toutes les questions ouvertes.
 * Priorise les questions proches de leur date de clôture.
 *
 * Appel Vercel Cron (vercel.json) ou externe (avec CRON_SECRET).
 * En local : curl http://localhost:3000/api/cron/forecast-ai?secret=<CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  // Auth guard
  const secret = req.nextUrl.searchParams.get('secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')

  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const db  = createAdminClient()
  const now = new Date()

  // Fetch open questions ordered by urgency (close_date ASC → most urgent first)
  const { data: questions, error } = await db
    .from('forecast_questions')
    .select(`
      id,
      close_date,
      forecast_channels ( slug )
    `)
    .eq('status', 'open')
    .gt('close_date', now.toISOString())
    .order('close_date', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!questions?.length) {
    return NextResponse.json({ queued: 0, message: 'Aucune question ouverte.' })
  }

  // Skip questions that already have a recent AI forecast (< 12h old)
  const { data: recentForecasts } = await db
    .from('forecast_ai_forecasts')
    .select('question_id, created_at')
    .eq('is_current', true)
    .gt('created_at', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())

  const recentIds = new Set((recentForecasts ?? []).map(f => f.question_id))

  const toProcess = questions.filter(q => !recentIds.has(q.id))

  if (!toProcess.length) {
    return NextResponse.json({ queued: 0, message: 'Toutes les questions ont un forecast IA récent.' })
  }

  // Queue AI forecast events (batch insert)
  const queueRows = toProcess.map(q => {
    const channelSlug = (q as any).forecast_channels?.slug ?? 'unknown'
    const eventId = crypto.randomUUID()
    const occurredAt = now.toISOString()

    return {
      event_type: 'forecast.ai.forecast.requested',
      correlation_id: q.id,
      payload: {
        id: eventId,
        type: 'forecast.ai.forecast.requested',
        occurredAt,
        correlationId: q.id,
        producer: 'web',
        version: 1,
        payload: {
          questionId: q.id,
          channelSlug,
          requestedBy: 'scheduler',
          force: false,
        },
      },
      status: 'pending',
      attempts: 0,
      max_attempts: 3,
      // Spread over time: 1 question every 2 minutes to avoid hitting rate limits
      available_at: new Date(now.getTime() + toProcess.indexOf(q) * 2 * 60 * 1000).toISOString(),
    }
  })

  const { error: insertErr } = await db.from('forecast_event_queue').insert(queueRows)

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  console.log(`[cron/forecast-ai] ${toProcess.length} questions mises en file.`)

  return NextResponse.json({
    queued: toProcess.length,
    skipped: questions.length - toProcess.length,
    questions: toProcess.map(q => ({ id: q.id, close_date: q.close_date })),
  })
}
