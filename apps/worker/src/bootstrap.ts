/**
 * bootstrap.ts — Point d'entrée du worker Forecast.
 *
 * IMPORTANT : Ce process tourne via PM2 / tsx, PAS via Next.js.
 * Next.js charge automatiquement .env.local, mais pas tsx.
 * On utilise dotenv pour charger les variables d'environnement manuellement
 * avant toute autre importation.
 */

// ── Chargement des env vars (doit être AVANT tout autre import) ───────────────
import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'

// Tente .env.local d'abord, puis .env (ordre identique à Next.js en production)
loadEnv({ path: resolve(process.cwd(), '.env.local') })
loadEnv({ path: resolve(process.cwd(), '.env.production') })
loadEnv({ path: resolve(process.cwd(), '.env') })

// ── Imports métier ────────────────────────────────────────────────────────────
import { consumeForecastQueueOnce } from './queue/consumer'
import { runSchedulerTick } from './scheduler'

const POLL_INTERVAL_MS = 5_000   // 5s quand queue vide
const BUSY_INTERVAL_MS = 500     // 0.5s quand jobs trouvés

function checkEnv() {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GEMINI_API_KEY',
  ]
  const missing = required.filter(k => !process.env[k])
  if (missing.length > 0) {
    console.error('[worker] ⚠️  Variables d\'environnement manquantes :', missing.join(', '))
    console.error('[worker] Vérifiez que .env.local est présent dans /var/www/durendal/')
    process.exit(1)
  }
}

async function main() {
  checkEnv()

  console.log('[worker] ✅ Variables d\'environnement chargées.')
  console.log('[worker] Démarrage du worker Forecast…')
  console.log('[worker] Scheduler : AI trigger 6h | close-check 1h | news-signal 2h (1er run au démarrage)')

  while (true) {
    try {
      await runSchedulerTick()

      const processed = await consumeForecastQueueOnce()
      const delay = processed > 0 ? BUSY_INTERVAL_MS : POLL_INTERVAL_MS
      await new Promise(r => setTimeout(r, delay))
    } catch (e) {
      console.error('[worker] Erreur critique dans la boucle principale :', e)
      await new Promise(r => setTimeout(r, 10_000))
    }
  }
}

main()
