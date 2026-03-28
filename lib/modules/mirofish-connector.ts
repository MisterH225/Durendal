/**
 * mirofish-connector.ts — Connecteur pour le moteur de prédiction MiroFish
 *
 * MiroFish est un moteur de simulation multi-agents (Python/Flask, port 5001)
 * qui construit des graphes de connaissances et simule des interactions pour
 * produire des rapports prédictifs.
 *
 * Pipeline MiroFish :
 *  1. POST /api/graph/upload-text   → Injecte le « seed material » (signaux + rapports)
 *  2. POST /api/graph/build         → Construit le graphe de connaissances
 *  3. POST /api/simulation/start    → Lance la simulation multi-agents
 *  4. GET  /api/simulation/{id}/status → Attend la fin
 *  5. POST /api/report/generate     → Génère le rapport de prédiction
 *  6. GET  /api/report/{id}         → Récupère le rapport
 *
 * Ce connecteur gère tout le cycle et retourne le texte du rapport.
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

function headers(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`
  return h
}

async function poll(
  url: string, apiKey: string, maxWaitMs: number = 300_000, intervalMs: number = 5_000,
): Promise<any> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: headers(apiKey) })
    if (!res.ok) throw new Error(`MiroFish poll error: ${res.status}`)
    const data = await res.json()
    if (data.data?.status === 'completed' || data.data?.status === 'finished') return data
    if (data.data?.status === 'error' || data.data?.status === 'failed') {
      throw new Error(`MiroFish simulation failed: ${data.data?.error ?? 'unknown'}`)
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error('MiroFish simulation timeout')
}

export async function checkMiroFishHealth(config: MiroFishConfig): Promise<boolean> {
  if (!config.enabled || !config.url) return false
  try {
    const res = await fetch(`${config.url}/api/health`, {
      headers: headers(config.apiKey),
      signal: AbortSignal.timeout(5_000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function runMiroFishPrediction(
  config: MiroFishConfig,
  seedMaterial: string,
  predictionQuery: string,
  log: (msg: string) => void = console.log,
): Promise<MiroFishPrediction> {
  const start = Date.now()
  const base  = config.url.replace(/\/$/, '')
  const hdrs  = headers(config.apiKey)

  try {
    log('[MiroFish] Upload du matériel de base...')
    const uploadRes = await fetch(`${base}/api/graph/upload-text`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        text: seedMaterial,
        name: `marketlens-prediction-${Date.now()}`,
        prediction_query: predictionQuery,
      }),
    })
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`)
    const { data: uploadData } = await uploadRes.json()
    const projectId = uploadData?.project_id
    if (!projectId) throw new Error('No project_id returned')
    log(`[MiroFish] Projet créé: ${projectId}`)

    log('[MiroFish] Construction du graphe de connaissances...')
    const buildRes = await fetch(`${base}/api/graph/build`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ project_id: projectId }),
    })
    if (!buildRes.ok) throw new Error(`Graph build failed: ${buildRes.status}`)
    const { data: buildData } = await buildRes.json()
    const graphId = buildData?.graph_id
    log(`[MiroFish] Graphe construit: ${graphId ?? 'ok'}`)

    log('[MiroFish] Démarrage de la simulation...')
    const simRes = await fetch(`${base}/api/simulation/start`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({
        project_id: projectId,
        graph_id: graphId,
        prediction_query: predictionQuery,
        max_rounds: 30,
      }),
    })
    if (!simRes.ok) throw new Error(`Simulation start failed: ${simRes.status}`)
    const { data: simData } = await simRes.json()
    const simulationId = simData?.simulation_id
    if (!simulationId) throw new Error('No simulation_id returned')
    log(`[MiroFish] Simulation lancée: ${simulationId}`)

    log('[MiroFish] Attente fin de simulation...')
    await poll(`${base}/api/simulation/${simulationId}/status`, config.apiKey)
    log('[MiroFish] Simulation terminée')

    log('[MiroFish] Génération du rapport prédictif...')
    const reportGenRes = await fetch(`${base}/api/report/generate`, {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ simulation_id: simulationId }),
    })
    if (!reportGenRes.ok) throw new Error(`Report generation failed: ${reportGenRes.status}`)
    const { data: reportData } = await reportGenRes.json()

    const reportId = reportData?.report_id
    if (reportId) {
      await poll(`${base}/api/report/${reportId}/status`, config.apiKey, 120_000)
      const reportRes = await fetch(`${base}/api/report/${reportId}`, { headers: hdrs })
      if (reportRes.ok) {
        const { data: report } = await reportRes.json()
        log(`[MiroFish] Rapport obtenu (${(report?.content?.length ?? 0)} chars)`)
        return {
          success: true,
          report: report?.content ?? report?.text ?? null,
          rawData: report,
          durationMs: Date.now() - start,
        }
      }
    }

    return {
      success: true,
      report: reportData?.content ?? reportData?.text ?? JSON.stringify(reportData),
      rawData: reportData,
      durationMs: Date.now() - start,
    }
  } catch (e: any) {
    log(`[MiroFish] Erreur: ${e.message}`)
    return { success: false, report: null, rawData: null, error: e.message, durationMs: Date.now() - start }
  }
}
