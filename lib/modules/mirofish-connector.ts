/**
 * mirofish-connector.ts — Connecteur pour le moteur de prédiction MiroFish
 *
 * MiroFish est un moteur de simulation multi-agents (Python/Flask, port 5001)
 * qui construit des graphes de connaissances via Zep Cloud et simule des
 * interactions sociales via OASIS pour produire des rapports prédictifs.
 *
 * Pipeline complet :
 *  1. POST /api/graph/ontology/generate  → Upload du matériel + génération d'ontologie
 *  2. POST /api/graph/build              → Construction du graphe de connaissances (async)
 *  3. GET  /api/graph/task/{id}          → Polling construction graphe
 *  4. POST /api/simulation/create        → Création de la simulation
 *  5. POST /api/simulation/prepare       → Préparation des profils agents (async)
 *  6. POST /api/simulation/prepare/status→ Polling préparation
 *  7. POST /api/simulation/start         → Démarrage de la simulation
 *  8. GET  /api/simulation/{id}/run-status → Polling exécution
 *  9. POST /api/report/generate          → Génération du rapport (async)
 * 10. GET  /api/report/by-simulation/{id}→ Récupération du rapport
 */

export interface MiroFishConfig {
  enabled:  boolean
  url:      string
  apiKey:   string
}

export interface MiroFishPrediction {
  success:    boolean
  report:     string | null
  rawData:    any | null
  error?:     string
  durationMs: number
}

/* ── helpers ────────────────────────────────────────────────── */

function jsonHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`
  return h
}

function authHeaders(apiKey: string): Record<string, string> {
  const h: Record<string, string> = {}
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`
  return h
}

async function pollTask(
  base: string,
  taskId: string,
  apiKey: string,
  log: (msg: string) => void,
  maxWaitMs = 600_000,
  intervalMs = 8_000,
): Promise<any> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/graph/task/${taskId}`, {
      headers: jsonHeaders(apiKey),
    })
    if (!res.ok) throw new Error(`Task poll ${taskId}: HTTP ${res.status}`)
    const body = await res.json()
    const status = body.data?.status
    if (status === 'completed') return body.data
    if (status === 'failed') throw new Error(`Task failed: ${body.data?.message ?? body.data?.error ?? 'unknown'}`)
    const pct = body.data?.progress ?? '?'
    log(`[MiroFish]   ↳ task ${taskId}: ${status} (${pct}%)`)
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`Task ${taskId} timeout after ${maxWaitMs}ms`)
}

async function pollSimPrepare(
  base: string,
  taskId: string,
  simulationId: string,
  apiKey: string,
  log: (msg: string) => void,
  maxWaitMs = 600_000,
  intervalMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/simulation/prepare/status`, {
      method: 'POST',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({ task_id: taskId, simulation_id: simulationId }),
    })
    if (!res.ok) throw new Error(`Prepare status poll: HTTP ${res.status}`)
    const body = await res.json()
    const status = body.data?.status
    if (status === 'completed' || status === 'ready') return
    if (status === 'failed') throw new Error(`Prepare failed: ${body.data?.message ?? 'unknown'}`)
    const pct = body.data?.progress ?? '?'
    log(`[MiroFish]   ↳ prepare: ${status} (${pct}%)`)
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`Simulation prepare timeout after ${maxWaitMs}ms`)
}

async function pollSimRun(
  base: string,
  simulationId: string,
  apiKey: string,
  log: (msg: string) => void,
  maxWaitMs = 900_000,
  intervalMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/simulation/${simulationId}/run-status`, {
      headers: jsonHeaders(apiKey),
    })
    if (!res.ok) throw new Error(`Run-status poll: HTTP ${res.status}`)
    const body = await res.json()
    const runnerStatus = body.data?.runner_status
    if (runnerStatus === 'completed' || runnerStatus === 'stopped' || runnerStatus === 'finished') return
    if (runnerStatus === 'failed' || runnerStatus === 'error') {
      throw new Error(`Simulation run failed: ${runnerStatus}`)
    }
    const round = body.data?.current_round ?? '?'
    const total = body.data?.total_rounds ?? '?'
    log(`[MiroFish]   ↳ simulation: ${runnerStatus} — round ${round}/${total}`)
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`Simulation run timeout after ${maxWaitMs}ms`)
}

async function pollReportGen(
  base: string,
  taskId: string,
  simulationId: string,
  apiKey: string,
  log: (msg: string) => void,
  maxWaitMs = 300_000,
  intervalMs = 6_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/report/generate/status`, {
      method: 'POST',
      headers: jsonHeaders(apiKey),
      body: JSON.stringify({ task_id: taskId, simulation_id: simulationId }),
    })
    if (!res.ok) throw new Error(`Report gen poll: HTTP ${res.status}`)
    const body = await res.json()
    const status = body.data?.status
    if (status === 'completed') return
    if (status === 'failed') throw new Error(`Report gen failed: ${body.data?.message ?? 'unknown'}`)
    const pct = body.data?.progress ?? '?'
    log(`[MiroFish]   ↳ report: ${status} (${pct}%)`)
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`Report generation timeout after ${maxWaitMs}ms`)
}

/* ── health check ──────────────────────────────────────────── */

export async function checkMiroFishHealth(config: MiroFishConfig): Promise<boolean> {
  if (!config.enabled || !config.url) return false
  try {
    const base = config.url.replace(/\/$/, '')
    const res = await fetch(`${base}/health`, {
      headers: authHeaders(config.apiKey),
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok
  } catch {
    return false
  }
}

/* ── full pipeline ─────────────────────────────────────────── */

export async function runMiroFishPrediction(
  config: MiroFishConfig,
  seedMaterial: string,
  predictionQuery: string,
  log: (msg: string) => void = console.log,
): Promise<MiroFishPrediction> {
  const start = Date.now()
  const base  = config.url.replace(/\/$/, '')

  try {
    // ── Step 1: Upload material & generate ontology ──────────
    log('[MiroFish] Étape 1/7 — Upload et génération d\'ontologie...')

    const formData = new FormData()
    const blob = new Blob([seedMaterial], { type: 'text/plain' })
    formData.append('files', blob, `marketlens-${Date.now()}.txt`)
    formData.append('simulation_requirement', predictionQuery)
    formData.append('project_name', `MarketLens Prediction ${new Date().toISOString().slice(0, 10)}`)

    const ontologyRes = await fetch(`${base}/api/graph/ontology/generate`, {
      method: 'POST',
      headers: authHeaders(config.apiKey),
      body: formData,
    })
    if (!ontologyRes.ok) {
      const errText = await ontologyRes.text().catch(() => '')
      throw new Error(`Ontology generate failed: ${ontologyRes.status} – ${errText.slice(0, 200)}`)
    }
    const ontologyBody = await ontologyRes.json()
    const projectId = ontologyBody.data?.project_id
    if (!projectId) throw new Error('No project_id from ontology/generate')
    log(`[MiroFish]   ✓ Projet créé: ${projectId}`)

    // ── Step 2: Build knowledge graph (async) ────────────────
    log('[MiroFish] Étape 2/7 — Construction du graphe de connaissances...')
    const buildRes = await fetch(`${base}/api/graph/build`, {
      method: 'POST',
      headers: jsonHeaders(config.apiKey),
      body: JSON.stringify({ project_id: projectId }),
    })
    if (!buildRes.ok) {
      const errText = await buildRes.text().catch(() => '')
      throw new Error(`Graph build failed: ${buildRes.status} – ${errText.slice(0, 200)}`)
    }
    const buildBody = await buildRes.json()
    const buildTaskId = buildBody.data?.task_id
    if (!buildTaskId) throw new Error('No task_id from graph/build')

    const buildResult = await pollTask(base, buildTaskId, config.apiKey, log)
    const graphId = buildResult?.result?.graph_id
    log(`[MiroFish]   ✓ Graphe construit: ${graphId ?? 'ok'}`)

    // ── Step 3: Create simulation ────────────────────────────
    log('[MiroFish] Étape 3/7 — Création de la simulation...')
    const createSimRes = await fetch(`${base}/api/simulation/create`, {
      method: 'POST',
      headers: jsonHeaders(config.apiKey),
      body: JSON.stringify({
        project_id: projectId,
        graph_id: graphId,
        enable_twitter: true,
        enable_reddit: false,
      }),
    })
    if (!createSimRes.ok) {
      const errText = await createSimRes.text().catch(() => '')
      throw new Error(`Simulation create failed: ${createSimRes.status} – ${errText.slice(0, 200)}`)
    }
    const createSimBody = await createSimRes.json()
    const simulationId = createSimBody.data?.simulation_id
    if (!simulationId) throw new Error('No simulation_id from simulation/create')
    log(`[MiroFish]   ✓ Simulation créée: ${simulationId}`)

    // ── Step 4: Prepare simulation (async) ───────────────────
    log('[MiroFish] Étape 4/7 — Préparation des profils agents...')
    const prepRes = await fetch(`${base}/api/simulation/prepare`, {
      method: 'POST',
      headers: jsonHeaders(config.apiKey),
      body: JSON.stringify({ simulation_id: simulationId }),
    })
    if (!prepRes.ok) {
      const errText = await prepRes.text().catch(() => '')
      throw new Error(`Simulation prepare failed: ${prepRes.status} – ${errText.slice(0, 200)}`)
    }
    const prepBody = await prepRes.json()
    if (!prepBody.data?.already_prepared) {
      const prepTaskId = prepBody.data?.task_id
      if (prepTaskId) {
        await pollSimPrepare(base, prepTaskId, simulationId, config.apiKey, log)
      }
    }
    log('[MiroFish]   ✓ Simulation prête')

    // ── Step 5: Start simulation ─────────────────────────────
    log('[MiroFish] Étape 5/7 — Lancement de la simulation multi-agents...')
    const startRes = await fetch(`${base}/api/simulation/start`, {
      method: 'POST',
      headers: jsonHeaders(config.apiKey),
      body: JSON.stringify({
        simulation_id: simulationId,
        platform: 'parallel',
        max_rounds: 20,
      }),
    })
    if (!startRes.ok) {
      const errText = await startRes.text().catch(() => '')
      throw new Error(`Simulation start failed: ${startRes.status} – ${errText.slice(0, 200)}`)
    }
    log('[MiroFish]   ✓ Simulation démarrée — attente...')

    await pollSimRun(base, simulationId, config.apiKey, log)
    log('[MiroFish]   ✓ Simulation terminée')

    // ── Step 6: Generate report (async) ──────────────────────
    log('[MiroFish] Étape 6/7 — Génération du rapport prédictif...')
    const reportGenRes = await fetch(`${base}/api/report/generate`, {
      method: 'POST',
      headers: jsonHeaders(config.apiKey),
      body: JSON.stringify({ simulation_id: simulationId }),
    })
    if (!reportGenRes.ok) {
      const errText = await reportGenRes.text().catch(() => '')
      throw new Error(`Report generate failed: ${reportGenRes.status} – ${errText.slice(0, 200)}`)
    }
    const reportGenBody = await reportGenRes.json()
    const reportTaskId = reportGenBody.data?.task_id
    const reportId     = reportGenBody.data?.report_id

    if (reportGenBody.data?.status !== 'completed' && reportTaskId) {
      await pollReportGen(base, reportTaskId, simulationId, config.apiKey, log)
    }

    // ── Step 7: Fetch report ─────────────────────────────────
    log('[MiroFish] Étape 7/7 — Récupération du rapport...')
    const fetchUrl = reportId
      ? `${base}/api/report/${reportId}`
      : `${base}/api/report/by-simulation/${simulationId}`
    const reportRes = await fetch(fetchUrl, { headers: jsonHeaders(config.apiKey) })
    if (!reportRes.ok) throw new Error(`Report fetch failed: ${reportRes.status}`)
    const reportBody = await reportRes.json()
    const report = reportBody.data

    const content = report?.markdown_content ?? report?.content ?? report?.text ?? null
    log(`[MiroFish] ✓ Rapport obtenu (${(content?.length ?? 0)} chars)`)

    return {
      success: true,
      report: content,
      rawData: report,
      durationMs: Date.now() - start,
    }
  } catch (e: any) {
    log(`[MiroFish] ✗ Erreur: ${e.message}`)
    return { success: false, report: null, rawData: null, error: e.message, durationMs: Date.now() - start }
  }
}
