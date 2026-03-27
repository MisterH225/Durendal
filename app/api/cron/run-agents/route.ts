import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Endpoint cron : déclenche les agents pour toutes les veilles dues.
 * Sécurisé par un secret CRON_SECRET dans les variables d'environnement.
 *
 * Appel depuis crontab VPS :
 *   # Toutes les heures (veilles "realtime" et "daily")
 *   0 * * * * curl -s -X POST https://durendal.pro/api/cron/run-agents \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -H "Content-Type: application/json"
 *
 *   # Tous les lundis à 7h (veilles "weekly")
 *   0 7 * * 1 curl -s -X POST https://durendal.pro/api/cron/run-agents \
 *     -H "Authorization: Bearer VOTRE_CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"frequency":"weekly"}'
 */

const FREQUENCY_INTERVALS: Record<string, number> = {
  realtime: 60 * 60 * 1000,          // 1 heure
  daily:    24 * 60 * 60 * 1000,     // 24 heures
  weekly:   7 * 24 * 60 * 60 * 1000, // 7 jours
}

export async function POST(req: NextRequest) {
  // Vérification du secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const targetFrequency: string | null = body.frequency || null

    const supabase = createClient()

    // Récupère toutes les veilles actives
    const { data: watches } = await supabase
      .from('watches')
      .select('id, frequency, last_run_at, name')
      .eq('is_active', true)

    if (!watches || watches.length === 0) {
      return NextResponse.json({ message: 'Aucune veille active', processed: 0 })
    }

    const now = Date.now()
    const results: { watchId: string; name: string; status: string }[] = []

    for (const watch of watches) {
      // Filtre par fréquence si spécifié
      if (targetFrequency && watch.frequency !== targetFrequency) continue

      const interval = FREQUENCY_INTERVALS[watch.frequency] ?? FREQUENCY_INTERVALS.daily
      const lastRun = watch.last_run_at ? new Date(watch.last_run_at).getTime() : 0
      const isDue = (now - lastRun) >= interval

      if (!isDue) {
        results.push({ watchId: watch.id, name: watch.name, status: 'skipped_not_due' })
        continue
      }

      try {
        // Agent 1 — Collecte
        const scrapeRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/agents/scrape`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ watchId: watch.id }),
          }
        )

        if (!scrapeRes.ok) {
          results.push({ watchId: watch.id, name: watch.name, status: 'scrape_error' })
          continue
        }

        // Agent 2 — Synthèse
        await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL}/api/agents/synthesize`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ watchId: watch.id }),
          }
        )

        results.push({ watchId: watch.id, name: watch.name, status: 'done' })
      } catch (err) {
        console.error(`[Cron] Erreur veille ${watch.id}:`, err)
        results.push({ watchId: watch.id, name: watch.name, status: 'error' })
      }

      // Pause entre les veilles pour éviter de surcharger les APIs
      await new Promise(r => setTimeout(r, 2000))
    }

    const done    = results.filter(r => r.status === 'done').length
    const skipped = results.filter(r => r.status === 'skipped_not_due').length
    const errors  = results.filter(r => r.status.includes('error')).length

    console.log(`[Cron] Terminé — ${done} lancés, ${skipped} ignorés, ${errors} erreurs`)

    return NextResponse.json({
      success: true,
      processed: done,
      skipped,
      errors,
      results,
    })
  } catch (error) {
    console.error('[Cron] Erreur générale:', error)
    return NextResponse.json({ error: 'Erreur cron' }, { status: 500 })
  }
}
