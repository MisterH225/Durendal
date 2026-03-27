/**
 * collector-engine.ts
 * Moteur de collecte des 4 agents IA — inspiré de l'architecture VeilleCI.
 *
 * Architecture :
 *   runAllAgentsParallel()
 *     └── Promise.allSettled([
 *           runAgentType('web_scanner', ...),
 *           runAgentType('press_monitor', ...),
 *           runAgentType('analyst', ...),
 *           runAgentType('deep_research', ...),
 *         ])
 *
 * Chaque agent type couvre TOUTES les entreprises de la veille
 * avec des stratégies de requêtes différentes.
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentType = 'web_scanner' | 'press_monitor' | 'analyst' | 'deep_research'

export interface CollectedSignal {
  company_id:  string
  title:       string
  content:     string
  url:         string
  source_name: string
  relevance:   number
  type:        string
}

export interface AgentResult {
  type:       AgentType
  signals:    CollectedSignal[]
  queriesRun: number
  errors:     string[]
  durationMs: number
}

export interface EngineResult {
  allSignals: CollectedSignal[]
  breakdown:  Partial<Record<AgentType, number>>
  durationMs: number
  errors:     string[]
}

// ─── Mapping ISO → noms complets ─────────────────────────────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  CI: "Côte d'Ivoire", SN: 'Sénégal',      GH: 'Ghana',      NG: 'Nigeria',
  KE: 'Kenya',         CM: 'Cameroun',      MA: 'Maroc',      ZA: 'Afrique du Sud',
  BJ: 'Bénin',         BF: 'Burkina Faso',  ML: 'Mali',       TG: 'Togo',
}

// ─── 1. DuckDuckGo Lite — moteur de recherche gratuit ────────────────────────
export async function webSearch(
  query: string,
  maxResults = 4,
): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const params = new URLSearchParams({ q: query, kl: 'fr-fr' })
    const res = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []
    const html = await res.text()

    const results: { title: string; url: string; snippet: string }[] = []

    // DDG Lite : résultats dans des <tr> contenant des <a href="...">
    const rowRegex = /<tr[\s\S]*?<\/tr>/gi
    const rows = html.match(rowRegex) || []

    for (const row of rows) {
      if (results.length >= maxResults) break
      const linkMatch = row.match(/href="(https?:\/\/(?!.*duckduckgo)[^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      if (!linkMatch) continue
      const url   = linkMatch[1].split('&rut=')[0]
      const title = linkMatch[2].replace(/<[^>]+>/g, '').trim()
      if (!url || !title || url.includes('duckduckgo.com')) continue
      const snippetM = row.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i)
      const snippet  = snippetM
        ? snippetM[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : ''
      results.push({ url, title, snippet })
    }

    return results
  } catch {
    return []
  }
}

// ─── 2. Extraction texte depuis une page HTML ─────────────────────────────────
export async function fetchPageContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketLens/1.0)',
        'Accept':     'text/html',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return ''
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return ''
    const html = await res.text()
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi,   ' ')
      .replace(/<head[\s\S]*?<\/head>/gi,      ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi,        ' ')
      .replace(/<header[\s\S]*?<\/header>/gi,  ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi,  ' ')
      .replace(/<[^>]+>/g,   ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g,       ' ')
      .trim()
      .slice(0, 8_000)
  } catch {
    return ''
  }
}

// ─── 3. Requêtes spécialisées par type d'agent ────────────────────────────────
// Reproduit buildSearchQueries() de VeilleCI (collector-engine.ts L532-620)
export function buildQueriesForAgent(
  type:         AgentType,
  companyName:  string,
  websiteHost:  string,
  sectors:      string[],
  countryNames: string[],
  year:         number,
): string[] {
  const primary = countryNames[0] || 'Afrique'
  const sector  = sectors.slice(0, 2).join(' ')

  switch (type) {
    // Scanner Web — sites officiels + news directes de l'entreprise
    case 'web_scanner':
      return [
        websiteHost
          ? `site:${websiteHost} actualités news ${year}`
          : `"${companyName}" actualités news ${year}`,
        `"${companyName}" ${primary} contrat partenariat ${year}`,
        `"${companyName}" financement levée fonds expansion ${year}`,
        `"${companyName}" communiqué presse press release ${year}`,
      ]

    // Presse Monitor — presse africaine + médias internationaux
    case 'press_monitor':
      return [
        `"${companyName}" ${primary} presse ${year}`,
        `${sector} Afrique actualités marché contrat ${year}`,
        `"${companyName}" (site:reuters.com OR site:theafricareport.com OR site:jeuneafrique.com OR site:bloomberglinea.com)`,
        `${sector} ${primary} appel offres investissement ${year}`,
      ]

    // Analyste — intelligence stratégique + rapports marché
    case 'analyst':
      return [
        `${sector} marché tendances analyse ${primary} ${year}`,
        `"${companyName}" stratégie acquisitions résultats financiers ${year}`,
        `${sector} industry market Africa competitive forecast ${year}`,
        `"${companyName}" rapport annuel annual report résultats ${year}`,
      ]

    // Chercheur profond — multi-angle (équivalent Perplexity researcher)
    case 'deep_research':
      return [
        `"${companyName}" latest news ${year}`,
        `${sector} ${primary} opportunités investissement projets ${year}`,
        `"${companyName}" concurrents compétiteurs analyse`,
        `${companyName} Africa ${sector} growth expansion partnership ${year}`,
      ]
  }
}

// ─── 4. Extraction de signaux via Gemini Flash ────────────────────────────────
export async function extractSignalsFromContent(
  content:        string,
  companyName:    string,
  watchCountries: string[],
): Promise<{ title: string; content: string; relevance: number; type: string }[]> {
  if (!content.trim() || content.length < 50) return []
  try {
    const countryList = watchCountries.map(c => COUNTRY_NAMES[c] || c).join(', ')
    const prompt = `Tu es un analyste de veille concurrentielle pour les marchés africains (${countryList}).
Extrais les informations pertinentes sur "${companyName}". Concentre-toi sur : financement, produits, partenariats, expansion, résultats, appels d'offres, contrats.

Contenu :
${content.slice(0, 5_000)}

Réponds UNIQUEMENT en JSON valide :
{"signals":[{"title":"titre factuel court","content":"résumé 2-3 phrases avec chiffres","relevance":0.8,"type":"funding|product|partnership|recruitment|expansion|contract|news|financial"}]}

Si rien de pertinent sur "${companyName}", réponds exactement : {"signals":[]}`

    const { text } = await callGemini(prompt, { model: 'gemini-2.5-flash', maxOutputTokens: 1_000 })
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    return (parsed?.signals || []).filter((s: any) => s.relevance >= 0.35)
  } catch {
    return []
  }
}

// ─── 5. Exécution d'un type d'agent pour toutes les entreprises ───────────────
// Reproduit runAgentCollector() de VeilleCI mais pour un type d'agent
export async function runAgentType(
  type:           AgentType,
  companies:      any[],
  sectors:        string[],
  watchCountries: string[],
  log:            (msg: string) => void,
): Promise<AgentResult> {
  const start        = Date.now()
  const signals:     CollectedSignal[] = []
  const errors:      string[]          = []
  let   queriesRun   = 0
  const countryNames = watchCountries.map(c => COUNTRY_NAMES[c] || c)
  const year         = new Date().getFullYear()

  log(`  [${type}] Démarrage — ${companies.length} entreprise(s)`)

  for (const company of companies) {
    let websiteHost = ''
    try { if (company.website) websiteHost = new URL(company.website).hostname } catch {}

    const queries = buildQueriesForAgent(type, company.name, websiteHost, sectors, countryNames, year)

    for (const query of queries) {
      try {
        const webResults = await webSearch(query, 4)
        queriesRun++

        for (const result of webResults) {
          // Extrait le contenu de la page (comme VeilleCI fetchPageContent)
          let pageContent = await fetchPageContent(result.url)
          if (pageContent.length < 100) {
            // Fallback : utilise le titre + snippet DDG
            pageContent = `${result.title}\n\n${result.snippet}`
          }
          if (pageContent.length < 30) continue

          const extracted = await extractSignalsFromContent(
            pageContent, company.name, watchCountries,
          )
          for (const s of extracted) {
            let hostname = result.url
            try { hostname = new URL(result.url).hostname } catch {}
            signals.push({
              company_id:  company.id,
              title:       s.title || result.title,
              content:     s.content,
              url:         result.url,
              source_name: hostname,
              relevance:   s.relevance,
              type:        s.type,
            })
          }
        }
        // Délai anti-spam
        await new Promise(r => setTimeout(r, 200))
      } catch (e: any) {
        const msg = `[${type}] "${query.slice(0, 40)}…" → ${e?.message ?? e}`
        errors.push(msg)
        log(`    ⚠ ${msg}`)
      }
    }
  }

  const durationMs = Date.now() - start
  log(`  [${type}] ✓ ${signals.length} signaux | ${queriesRun} requêtes | ${durationMs}ms`)
  return { type, signals, queriesRun, errors, durationMs }
}

// ─── 6. Orchestrateur principal : 4 agents en parallèle ──────────────────────
// Reproduit runAllWatchAgents() de VeilleCI (Promise.all sur les 4 types)
export async function runAllAgentsParallel(
  companies:      any[],
  sectors:        string[],
  watchCountries: string[],
  log:            (msg: string) => void = console.log,
): Promise<EngineResult> {
  const start = Date.now()
  const agentTypes: AgentType[] = ['web_scanner', 'press_monitor', 'analyst', 'deep_research']

  log(`[Engine] ★ Lancement de ${agentTypes.length} agents en PARALLÈLE`)
  log(`[Engine]   Entreprises  : ${companies.map((c: any) => c.name).join(', ')}`)
  log(`[Engine]   Secteurs     : ${sectors.join(', ')}`)
  log(`[Engine]   Pays         : ${watchCountries.join(', ')}`)

  // ★ Exécution concurrente — comme Promise.all(agentIds.map(runAgentCollector))
  const promises = agentTypes.map(type =>
    runAgentType(type, companies, sectors, watchCountries, log).catch((e: any): AgentResult => {
      log(`  [${type}] ✗ FATAL: ${e?.message ?? e}`)
      return { type, signals: [], queriesRun: 0, errors: [`Fatal: ${e?.message}`], durationMs: 0 }
    }),
  )

  const settled = await Promise.allSettled(promises)

  const allSignals: CollectedSignal[]             = []
  const breakdown: Partial<Record<AgentType, number>> = {}
  const errors:    string[]                        = []

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      const r = result.value
      allSignals.push(...r.signals)
      breakdown[r.type] = r.signals.length
      errors.push(...r.errors)
    } else {
      log(`  ✗ Agent rejeté: ${result.reason}`)
      errors.push(String(result.reason))
    }
  }

  const durationMs = Date.now() - start
  log(`[Engine] ══ COLLECTE TERMINÉE ══`)
  log(`[Engine]   web_scanner   : ${breakdown.web_scanner   ?? 0} signaux`)
  log(`[Engine]   press_monitor : ${breakdown.press_monitor ?? 0} signaux`)
  log(`[Engine]   analyst       : ${breakdown.analyst       ?? 0} signaux`)
  log(`[Engine]   deep_research : ${breakdown.deep_research ?? 0} signaux`)
  log(`[Engine]   TOTAL         : ${allSignals.length} signaux en ${durationMs}ms`)

  return { allSignals, breakdown, durationMs, errors }
}
