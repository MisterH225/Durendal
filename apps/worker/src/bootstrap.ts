import { consumeForecastQueueOnce } from './queue/consumer'
import { runSchedulerTick } from './scheduler'

const POLL_INTERVAL_MS = 5_000   // 5s quand queue vide
const BUSY_INTERVAL_MS = 500     // 0.5s quand jobs trouvés

async function main() {
  console.log('[worker] Démarrage du worker Forecast…')
  console.log('[worker] Scheduler intégré — AI trigger 6h, close-check 1h, news-signal 4h')

  while (true) {
    try {
      // Run scheduled tasks (non-blocking, skips if interval not reached)
      await runSchedulerTick()

      // Consume queued jobs
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
