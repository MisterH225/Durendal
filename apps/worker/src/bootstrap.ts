/**
 * bootstrap.ts — Point d'entrée du worker Forecast.
 *
 * IMPORTANT : Ce process tourne via PM2 / tsx, PAS via Next.js.
 * Next.js charge automatiquement .env.local, mais pas tsx.
 * On utilise dotenv pour charger les variables d'environnement manuellement
 * avant toute autre importation.
 */

// ── Chargement des env vars (doit être AVANT tout autre import) ───────────────
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

/** Répertoire de ce fichier (apps/worker/src), fiable même si process.cwd() est faux sous PM2. */
function bootstrapDir(): string | null {
  try {
    const u = import.meta?.url
    if (!u) return null
    return path.dirname(fileURLToPath(u))
  } catch {
    return null
  }
}

/** Remonte les dossiers depuis `starts` pour trouver la racine du repo (package.json name = marketlens). */
function findMarketlensRoot(starts: string[]): string | null {
  for (const start of starts) {
    let dir = path.resolve(start)
    for (let depth = 0; depth < 24; depth++) {
      const pkgPath = path.join(dir, 'package.json')
      if (fs.existsSync(pkgPath)) {
        try {
          const name = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))?.name as string | undefined
          if (name === 'marketlens') return dir
        } catch {
          /* ignore */
        }
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

const fromBootstrap = bootstrapDir()
const repoCandidates = [
  ...(fromBootstrap
    ? [fromBootstrap, path.resolve(fromBootstrap, '..', '..', '..')]
    : []),
  process.cwd(),
  path.join(process.cwd(), 'apps', 'worker'),
]

const repoRoot = findMarketlensRoot(repoCandidates) ?? process.cwd()

console.log('[worker] Racine repo pour .env :', repoRoot, '| cwd :', process.cwd())

// D’abord la racine du repo (PM2 cwd peut être un sous-dossier), puis cwd avec override
for (const file of ['.env.local', '.env.production', '.env'] as const) {
  loadEnv({ path: path.join(repoRoot, file) })
}
for (const file of ['.env.local', '.env.production', '.env'] as const) {
  loadEnv({ path: path.join(process.cwd(), file), override: true })
}

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
    console.error('[worker] Vérifiez .env.local à la racine du repo (ou dans le cwd PM2), avec SUPABASE_SERVICE_ROLE_KEY et GEMINI_API_KEY.')
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
