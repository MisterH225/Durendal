/**
 * GET /api/cron/forecast-news
 *
 * Déclenche la génération de signaux d'actualité (news) pour tous les canaux actifs.
 * Ce job est indépendant des questions forecast — il génère des signaux informatifs
 * basés sur les actualités récentes via Gemini Search Grounding.
 *
 * Appel externe : curl http://localhost:3000/api/cron/forecast-news?secret=<CRON_SECRET>
 * Le worker l'exécute aussi automatiquement toutes les 4h via le scheduler interne.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')

  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const db  = createAdminClient()
  const now = new Date()

  const eventId = crypto.randomUUID()

  const { error } = await db.from('forecast_event_queue').insert({
    event_type:     'forecast.news.signal.requested',
    correlation_id: null,
    payload: {
      id:            eventId,
      type:          'forecast.news.signal.requested',
      occurredAt:    now.toISOString(),
      correlationId: null,
      producer:      'web',
      version:       1,
      payload:       {},
    },
    status:       'pending',
    attempts:     0,
    max_attempts: 2,
    available_at: now.toISOString(),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    queued: 1,
    message: 'Job news-signal mis en file — le worker va générer des signaux pour tous les canaux actifs.',
  })
}
