/**
 * GET /api/cron/forecast-questions
 *
 * Génère événements + questions ouvertes (Gemini) pour tous les canaux actifs,
 * comme le worker (forecast:question-generator). Utile si le worker ne tourne pas
 * ou pour forcer un run après déploiement.
 *
 * Appel : GET /api/cron/forecast-questions?secret=<CRON_SECRET>
 * Timeout attendu : plusieurs minutes (7 canaux × Gemini + pauses).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runQuestionGenerator } from '@/lib/forecast/question-generator'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')

  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error: 'SUPABASE_SERVICE_ROLE_KEY manquante',
        hint: 'Les insertions forecast nécessitent la clé service côté Next.js (RLS).',
      },
      { status: 500 },
    )
  }

  try {
    const db = createAdminClient()
    const result = await runQuestionGenerator(db)

    if (result.skippedNoChannels) {
      return NextResponse.json(
        {
          ok: false,
          ...result,
          hint:
            'Vérifiez que la migration 016 est appliquée (table forecast_channels + seed).',
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      ...result,
      message: `${result.createdQuestions} question(s), ${result.createdEvents} événement(s).`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[forecast-questions]', e)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
