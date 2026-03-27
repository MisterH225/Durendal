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

import { callGemini, parseGeminiJson }                                            from '@/lib/ai/gemini'
import { perplexityWebSearch, perplexityEmbed, cosineSimilarity, PerplexityFilters } from '@/lib/ai/perplexity'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentType =
  | 'web_scanner'
  | 'press_monitor'
  | 'analyst'
  | 'deep_search'
  | 'deep_research'
  | 'deep_research_iterative'

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

/** Requête enrichie avec filtres Perplexity */
export interface AgentQuery {
  query:   string
  filters: PerplexityFilters
}

/** Source telle que stockée dans la table `sources` (admin). */
export interface SourceRecord {
  id:                string
  url?:              string | null
  rss_url?:          string | null
  name:              string
  source_category?:  string | null
  countries?:        string[] | null
  sectors?:          string[] | null
  reliability_score?: number | null
  is_active:         boolean
}

// ─── Mapping ISO → noms complets ─────────────────────────────────────────────
const COUNTRY_NAMES: Record<string, string> = {
  CI: "Côte d'Ivoire", SN: 'Sénégal',      GH: 'Ghana',      NG: 'Nigeria',
  KE: 'Kenya',         CM: 'Cameroun',      MA: 'Maroc',      ZA: 'Afrique du Sud',
  BJ: 'Bénin',         BF: 'Burkina Faso',  ML: 'Mali',       TG: 'Togo',
  CD: 'RDC',           GA: 'Gabon',         NE: 'Niger',      GN: 'Guinée',
  MG: 'Madagascar',    TN: 'Tunisie',       DZ: 'Algérie',    ET: 'Éthiopie',
}

// ─── Extraction dynamique de domaines depuis la table `sources` (admin) ─────
//
// Perplexity search_domain_filter : max 20 domaines par requête.
// Au lieu de hardcoder les sources, on les tire de la DB.
// L'admin peut ajouter/retirer des sources sans toucher au code.

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

/**
 * Sélectionne les sources pertinentes pour la veille puis extrait les domaines.
 * Filtre par pays/secteurs de la veille, trie par reliability_score.
 */
function getRelevantSources(
  sources:        SourceRecord[],
  watchCountries: string[],
  watchSectors:   string[],
  categories?:    string[],
): SourceRecord[] {
  return sources
    .filter(s => {
      if (!s.is_active || !s.url) return false
      if (categories?.length && !categories.includes(s.source_category ?? '')) return false
      const matchesCountry = s.countries?.some(c => watchCountries.includes(c))
      const matchesSector  = s.sectors?.some(sec => watchSectors.includes(sec))
      return matchesCountry || matchesSector
    })
    .sort((a, b) => (b.reliability_score ?? 3) - (a.reliability_score ?? 3))
}

/**
 * Compose la liste de domaines pour un type d'agent (max 20).
 * Tire les domaines de la table `sources` (admin), filtrés par catégorie.
 */
function getDomainsForAgent(
  type:           AgentType,
  sources:        SourceRecord[],
  watchCountries: string[],
  watchSectors:   string[],
): string[] {
  let relevant: SourceRecord[]

  switch (type) {
    case 'web_scanner':
      // Bibliothèque admin : toutes les sources pertinentes (pays/secteurs)
      relevant = getRelevantSources(sources, watchCountries, watchSectors, undefined)
      break

    case 'press_monitor':
      relevant = getRelevantSources(sources, watchCountries, watchSectors, ['press', 'blog', 'social'])
      break

    case 'analyst':
      relevant = getRelevantSources(sources, watchCountries, watchSectors, ['institutional', 'press'])
      break

    case 'deep_research':
    case 'deep_research_iterative':
      relevant = getRelevantSources(sources, watchCountries, watchSectors, undefined)
      break

    default:
      return []
  }

  return relevant
    .map(s => extractDomain(s.url!))
    .filter(Boolean)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .slice(0, 20)
}

// ─── 1. Moteurs de recherche (cascade : Perplexity → Firecrawl) ──────────────
//
// Hiérarchie :
//   1. Perplexity Responses/Search API — synthèse + citations, fonctionne depuis VPS
//   2. Firecrawl Search                — résultats bruts, fonctionne depuis VPS
//
// DDG Lite supprimé : bloqué systématiquement depuis les IP datacenter/VPS.
//
// Résultat enrichi : { title, url, snippet, fullContent? }
// Quand `fullContent` est présent, on SKIP fetchPageContent (contenu déjà extrait).

export interface SearchResult {
  title:        string
  url:          string
  snippet:      string
  /** Contenu extrait par Perplexity — skip fetchPageContent si présent */
  fullContent?: string
}

// ── 1a. Perplexity Search API ─────────────────────────────────────────────────
async function pplxSearch(
  query:      string,
  maxResults: number,
  filters?:   PerplexityFilters,
): Promise<SearchResult[]> {
  if (!process.env.PERPLEXITY_API_KEY) return []
  try {
    return await perplexityWebSearch(query, maxResults, filters)
  } catch {
    return []
  }
}

// ── 1b. Firecrawl Search ──────────────────────────────────────────────────────
async function firecrawlWebSearch(
  query:      string,
  maxResults: number,
): Promise<SearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ query, limit: maxResults }),
      signal:  AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data ?? [])
      .slice(0, maxResults)
      .map((r: any) => ({
        title:   r.title       ?? r.url ?? '',
        url:     r.url         ?? '',
        snippet: r.description ?? r.markdown?.slice(0, 400) ?? '',
      }))
      .filter((r: any) => r.url && r.title)
  } catch {
    return []
  }
}

// ── Orchestrateur principal ───────────────────────────────────────────────────
export async function webSearch(
  query:      string,
  maxResults = 3,
  filters?:   PerplexityFilters,
): Promise<SearchResult[]> {
  // Niveau 1 : Perplexity avec filtres (domaines, récence, langue, pays)
  const pplx = await pplxSearch(query, maxResults, filters)
  if (pplx.length > 0) return pplx

  // Niveau 2 : Firecrawl (résultats bruts, pas de filtrage domaine)
  return firecrawlWebSearch(query, maxResults)
}

// ─── 2. Extraction texte depuis une page HTML ─────────────────────────────────
export async function fetchPageContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketLens/1.0)',
        'Accept':     'text/html',
      },
      signal: AbortSignal.timeout(5_000),
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
//
// Retourne des AgentQuery[] : requêtes en langage naturel (optimisées Perplexity)
// + filtres API (domaines spécialisés, récence, langue, pays).
//
// IMPORTANT : pas d'opérateurs Google (site:, OR, etc.) — Perplexity ne les
// supporte pas. Le ciblage des sources se fait via search_domain_filter.

export function buildQueriesForAgent(
  type:           AgentType,
  companyName:    string,
  websiteHost:    string,
  sectors:        string[],
  countryNames:   string[],
  watchCountries: string[],
  year:           number,
  sources:        SourceRecord[],
): AgentQuery[] {
  const primary = countryNames[0] || 'Afrique'
  const sector  = sectors.slice(0, 2).join(' ')

  const domains   = getDomainsForAgent(type, sources, watchCountries, sectors)
  const country   = watchCountries[0] || undefined
  const languages = ['fr', 'en']

  const baseFilters: PerplexityFilters = {
    recency:   'year',
    languages,
    country,
    ...(domains.length > 0 ? { domains } : {}),
  }

  const q = (query: string, filterOverrides?: Partial<PerplexityFilters>): AgentQuery => ({
    query,
    filters: { ...baseFilters, ...filterOverrides },
  })

  switch (type) {
    case 'web_scanner':
      return [
        q(`${companyName} actualités récentes ${primary} ${year}`, { recency: 'month' }),
        q(`${companyName} contrat partenariat ${primary} ${year}`),
        q(`${companyName} financement levée de fonds expansion ${year}`),
        q(`${companyName} communiqué de presse résultats ${year}`),
      ]

    case 'press_monitor':
      return [
        q(`${companyName} ${primary} actualités presse ${year}`),
        q(`${sector} Afrique actualités marché contrat ${year}`),
        q(`${companyName} Afrique partenariat investissement ${year}`),
        q(`${sector} ${primary} appel d'offres projet ${year}`),
      ]

    case 'analyst':
      return [
        q(`${sector} marché tendances analyse ${primary} ${year}`),
        q(`${companyName} stratégie acquisitions résultats financiers ${year}`),
        q(`${sector} Africa market competitive landscape forecast ${year}`),
        q(`${companyName} rapport annuel résultats chiffre d'affaires ${year}`),
      ]

    case 'deep_research':
      return [
        q(`${companyName} dernières actualités ${year}`, { recency: 'month' }),
        q(`${sector} ${primary} opportunités investissement projets ${year}`),
        q(`${companyName} concurrents analyse compétitive ${primary}`),
        q(`${companyName} Africa ${sector} growth expansion partnership ${year}`),
      ]

    default:
      return []
  }
}

// ─── 3b. Filtrage par embeddings (pre-Gemini) ────────────────────────────────
//
// Avant d'appeler Gemini (coûteux), on vérifie sémantiquement si le contenu
// est pertinent pour l'entreprise surveillée via similarité cosinus.
//
// Flux : Perplexity Search → [embed batch] → filtre cos > seuil → Gemini extract
// Gain : évite les appels Gemini sur du contenu hors sujet (moins cher + plus rapide)

// Cache d'embeddings de contexte entreprise — durée de vie = une session agent
const _embeddingCache = new Map<string, number[]>()

/**
 * Filtre les résultats de recherche par pertinence sémantique.
 * Retourne uniquement les résultats dont la similarité cosinus avec le
 * contexte entreprise dépasse le seuil (défaut 0.15).
 *
 * - Si l'API embeddings échoue → tous les résultats passent (pas de perte)
 * - Batch : company context + tous les snippets en UN seul appel API
 */
async function filterByRelevance(
  results:     SearchResult[],
  companyName: string,
  sectors:     string[],
  countries:   string[],
): Promise<SearchResult[]> {
  // Désactivé temporairement : le seuil élimine trop de résultats pertinents.
  // Le filtrage se fera par Gemini lors de l'extraction (relevance >= 0.25).
  // TODO: réactiver avec un seuil calibré après tests sur données réelles.
  return results
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
    console.log(`[extract] Gemini brut (200c): ${text.slice(0, 200)}`)
    const parsed = parseGeminiJson<{ signals: any[] }>(text)
    const all = parsed?.signals || []
    const filtered = all.filter((s: any) => s.relevance >= 0.25)
    console.log(`[extract] "${companyName}": parsed=${!!parsed} total=${all.length} après_filtre=${filtered.length}`)
    return filtered
  } catch (e: any) {
    console.error(`[extract] ERREUR "${companyName}":`, e?.message ?? e)
    return []
  }
}

// ─── 5. Exécution d'un type d'agent pour toutes les entreprises ───────────────
export async function runAgentType(
  type:           AgentType,
  companies:      any[],
  sectors:        string[],
  watchCountries: string[],
  sources:        SourceRecord[],
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

    const agentQueries = buildQueriesForAgent(
      type, company.name, websiteHost, sectors, countryNames, watchCountries, year, sources,
    )

    for (const { query, filters } of agentQueries) {
      try {
        const rawResults = await webSearch(query, 3, filters)
        queriesRun++

        const webResults = await filterByRelevance(
          rawResults, company.name, sectors, watchCountries,
        )
        if (rawResults.length > webResults.length) {
          log(`    [${type}] embed-filter: ${rawResults.length} → ${webResults.length} résultats`)
        }

        const jobs = webResults.map(async (result) => {
          let pageContent: string
          if (result.fullContent && result.fullContent.length > 80) {
            pageContent = result.fullContent
          } else {
            pageContent = await fetchPageContent(result.url)
            if (pageContent.length < 100) pageContent = `${result.title}\n\n${result.snippet}`
          }
          if (pageContent.length < 30) return

          const extracted = await extractSignalsFromContent(pageContent, company.name, watchCountries)
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
        })
        await Promise.allSettled(jobs)
        await new Promise(r => setTimeout(r, 150))
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

// ─── 6. Deep Research Itératif (Perplexity-style) ────────────────────────────
//
// Contrairement aux 4 agents avec requêtes fixes, cet agent :
//  1. Demande à Gemini de GÉNÉRER les sous-questions de recherche
//  2. Recherche et extrait pour chaque sous-question
//  3. Demande à Gemini d'ÉVALUER les gaps restants
//  4. Lance une 2ème itération ciblée sur les gaps
//
// C'est l'équivalent du "Perplexity Deep Research" :
// le LLM pilote lui-même la stratégie de recherche.

/** ÉTAPE 1 : Gemini génère des sous-questions de recherche ciblées */
async function generateSubQuestions(
  companyName:  string,
  sectors:      string[],
  countryNames: string[],
): Promise<string[]> {
  const primary = countryNames[0] || 'Afrique'
  const sector  = sectors.slice(0, 2).join(', ')
  const year    = new Date().getFullYear()

  const prompt = `Tu es un expert en intelligence économique africaine.
Pour analyser l'entreprise "${companyName}" (secteur : ${sector}, marché principal : ${primary}),
génère exactement 5 sous-questions de recherche web précises et COMPLÉMENTAIRES.

Chaque question doit couvrir un angle différent :
- Situation financière et levées de fonds récentes
- Contrats, appels d'offres et partenariats en ${year - 1}-${year}
- Positionnement et concurrents directs en Afrique
- Expansion géographique, nouveaux marchés ou produits
- Actualités opérationnelles (recrutements, dirigeants, projets)

Formule les questions comme des REQUÊTES DE RECHERCHE WEB efficaces.
Réponds UNIQUEMENT en JSON : {"questions":["requête 1","requête 2","requête 3","requête 4","requête 5"]}`

  try {
    const { text } = await callGemini(prompt, { model: 'gemini-2.5-flash', maxOutputTokens: 600 })
    const parsed   = parseGeminiJson<{ questions: string[] }>(text)
    return (parsed?.questions ?? []).slice(0, 3).filter(q => q.length > 5)
  } catch {
    // Fallback : requêtes génériques si Gemini échoue
    return [
      `"${companyName}" ${primary} actualités ${year}`,
      `"${companyName}" contrat partenariat ${year}`,
      `"${companyName}" concurrents ${sector}`,
    ]
  }
}

/** ÉTAPE 3 : Gemini évalue les gaps et génère des requêtes de suivi */
async function evaluateGapsAndFollowUp(
  companyName:  string,
  sectors:      string[],
  countryNames: string[],
  findings:     string[],
): Promise<string[]> {
  if (findings.length === 0) return []
  const primary = countryNames[0] || 'Afrique'
  const sector  = sectors.slice(0, 2).join(', ')

  const prompt = `Tu analyses les informations collectées sur "${companyName}" (${sector}, ${primary}).

RÉSULTATS COLLECTÉS (itération 1) :
${findings.slice(0, 25).map((f, i) => `[${i + 1}] ${f.slice(0, 250)}`).join('\n')}

Identifie les LACUNES importantes — aspects non couverts ou insuffisamment documentés.
Pour chaque lacune pertinente, génère UNE requête de recherche web précise pour la combler.
Maximum 3 requêtes de suivi.

Réponds UNIQUEMENT en JSON :
{"gaps":["description du gap 1","gap 2"],"followup_queries":["requête web 1","requête web 2","requête web 3"]}

Si les informations sont suffisantes et complètes, réponds : {"gaps":[],"followup_queries":[]}`

  try {
    const { text } = await callGemini(prompt, { model: 'gemini-2.5-flash', maxOutputTokens: 500 })
    const parsed   = parseGeminiJson<{ gaps: string[]; followup_queries: string[] }>(text)
    return (parsed?.followup_queries ?? []).slice(0, 3).filter(q => q.length > 5)
  } catch {
    return []
  }
}

/**
 * Agent Deep Research Itératif
 * 5ème agent parallèle — le LLM pilote sa propre stratégie de recherche.
 * Reproduit le comportement "Perplexity Deep Research".
 */
export async function runDeepResearchAgent(
  companies:      any[],
  sectors:        string[],
  watchCountries: string[],
  sources:        SourceRecord[],
  log:            (msg: string) => void,
): Promise<AgentResult> {
  const start        = Date.now()
  const allSignals:  CollectedSignal[] = []
  const errors:      string[]          = []
  let   queriesRun   = 0
  const countryNames = watchCountries.map(c => COUNTRY_NAMES[c] || c)
  const MAX_ITER     = 1 // ★ Budget temps : 1 seule itération sur Nginx (60s)

  log(`  [deep_research_iterative] ★ Démarrage — ${companies.length} entreprise(s)`)

  for (const company of companies) {
    log(`\n  [deep_research_iterative] ══ "${company.name}" ══`)

    // ── ITER 0 : Gemini génère les sous-questions ──────────────────────────
    log(`  [deep_research_iterative] Génération des sous-questions (Gemini)...`)
    const subQuestions = await generateSubQuestions(company.name, sectors, countryNames)
    log(`  [deep_research_iterative] ${subQuestions.length} sous-questions :`)
    subQuestions.forEach((q, i) => log(`    ${i + 1}. ${q}`))

    const allFindings: string[] = [] // résumés accumulés pour l'analyse de gaps
    let currentQueries = subQuestions

    const deepDomains = getDomainsForAgent('deep_research_iterative', sources, watchCountries, sectors)
    const deepFilters: PerplexityFilters = {
      recency:   'year',
      languages: ['fr', 'en'],
      country:   watchCountries[0] || undefined,
      ...(deepDomains.length > 0 ? { domains: deepDomains } : {}),
    }

    for (let iter = 0; iter < MAX_ITER; iter++) {
      if (currentQueries.length === 0) break
      log(`  [deep_research_iterative] Itération ${iter + 1}/${MAX_ITER} — ${currentQueries.length} requêtes`)

      for (const query of currentQueries) {
        try {
          const rawResults = await webSearch(query, 3, deepFilters)
          queriesRun++

          const webResults = await filterByRelevance(
            rawResults, company.name, sectors, watchCountries,
          )

          const drJobs = webResults.map(async (result) => {
            let pageContent: string
            if ((result as any).fullContent && (result as any).fullContent.length > 80) {
              pageContent = (result as any).fullContent
            } else {
              pageContent = await fetchPageContent(result.url)
              if (pageContent.length < 100) pageContent = `${result.title}\n\n${result.snippet}`
            }
            if (pageContent.length < 30) return
            allFindings.push(`${result.title}: ${pageContent.slice(0, 300)}`)
            const extracted = await extractSignalsFromContent(pageContent, company.name, watchCountries)
            for (const s of extracted) {
              let hostname = result.url
              try { hostname = new URL(result.url).hostname } catch {}
              allSignals.push({ company_id: company.id, title: s.title || result.title, content: s.content, url: result.url, source_name: hostname, relevance: s.relevance, type: s.type })
            }
          })
          await Promise.allSettled(drJobs)
          await new Promise(r => setTimeout(r, 300))
        } catch (e: any) {
          const msg = `[DR-iter${iter + 1}] "${query.slice(0, 40)}…": ${e?.message ?? e}`
          errors.push(msg)
          log(`    ⚠ ${msg}`)
        }
      }

      // ── Analyse des gaps après l'itération 1 seulement ────────────────
      if (iter === 0) {
        log(`  [deep_research_iterative] Analyse des gaps (Gemini)...`)
        const followUps = await evaluateGapsAndFollowUp(
          company.name, sectors, countryNames, allFindings,
        )
        if (followUps.length > 0) {
          log(`  [deep_research_iterative] ${followUps.length} requêtes de suivi :`)
          followUps.forEach((q, i) => log(`    ↳ ${i + 1}. ${q}`))
          currentQueries = followUps
        } else {
          log(`  [deep_research_iterative] Pas de gaps — recherche complète ✓`)
          break
        }
      }
    }

    const companySignals = allSignals.filter(s => s.company_id === company.id)
    log(`  [deep_research_iterative] "${company.name}" → ${companySignals.length} signaux | ${queriesRun} requêtes`)
  }

  const durationMs = Date.now() - start
  log(`  [deep_research_iterative] ✓ TOTAL ${allSignals.length} signaux | ${queriesRun} requêtes | ${durationMs}ms`)

  return {
    type:       'deep_research_iterative',
    signals:    allSignals,
    queriesRun,
    errors,
    durationMs,
  }
}

// ─── 7. Orchestrateur principal : 5 agents en parallèle ──────────────────────
export async function runAllAgentsParallel(
  companies:      any[],
  sectors:        string[],
  watchCountries: string[],
  sources:        SourceRecord[],
  log:            (msg: string) => void = console.log,
): Promise<EngineResult> {
  const start = Date.now()

  const webDomains     = getDomainsForAgent('web_scanner', sources, watchCountries, sectors)
  const pressDomains   = getDomainsForAgent('press_monitor', sources, watchCountries, sectors)
  const analystDomains = getDomainsForAgent('analyst', sources, watchCountries, sectors)
  const deepDomains    = getDomainsForAgent('deep_research_iterative', sources, watchCountries, sectors)

  log(`[Engine] ★ Lancement de 5 agents en PARALLÈLE`)
  log(`[Engine]   Entreprises  : ${companies.map((c: any) => c.name).join(', ')}`)
  log(`[Engine]   Secteurs     : ${sectors.join(', ')}`)
  log(`[Engine]   Pays         : ${watchCountries.join(', ')}`)
  log(`[Engine]   Sources DB   : ${sources.length} pour cette veille`)
  log(`[Engine]   → web_scanner : ${webDomains.join(', ') || '(recherche large)'}`)
  log(`[Engine]   → presse      : ${pressDomains.join(', ') || '(recherche large)'}`)
  log(`[Engine]   → analyst     : ${analystDomains.join(', ') || '(recherche large)'}`)
  log(`[Engine]   → deep_iter   : ${deepDomains.join(', ') || '(recherche large)'}`)
  log(`[Engine]   Agents       : web_scanner | press_monitor | analyst | deep_research | deep_research_iterative`)

  const fixedTypes: AgentType[] = ['web_scanner', 'press_monitor', 'analyst', 'deep_research']
  const fixedPromises = fixedTypes.map(type =>
    runAgentType(type, companies, sectors, watchCountries, sources, log).catch((e: any): AgentResult => {
      log(`  [${type}] ✗ FATAL: ${e?.message ?? e}`)
      return { type, signals: [], queriesRun: 0, errors: [`Fatal: ${e?.message}`], durationMs: 0 }
    }),
  )

  const deepResearchPromise = runDeepResearchAgent(companies, sectors, watchCountries, sources, log)
    .catch((e: any): AgentResult => {
      log(`  [deep_research_iterative] ✗ FATAL: ${e?.message ?? e}`)
      return {
        type:       'deep_research_iterative',
        signals:    [],
        queriesRun: 0,
        errors:     [`Fatal: ${e?.message}`],
        durationMs: 0,
      }
    })

  // Tous en parallèle — si un agent échoue, les 4 autres continuent
  const settled = await Promise.allSettled([...fixedPromises, deepResearchPromise])

  const allSignals: CollectedSignal[]               = []
  const breakdown: Partial<Record<AgentType, number>> = {}
  const errors:    string[]                          = []

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
  log(`[Engine]   web_scanner             : ${breakdown.web_scanner               ?? 0} signaux`)
  log(`[Engine]   press_monitor           : ${breakdown.press_monitor             ?? 0} signaux`)
  log(`[Engine]   analyst                 : ${breakdown.analyst                   ?? 0} signaux`)
  log(`[Engine]   deep_research           : ${breakdown.deep_research             ?? 0} signaux`)
  log(`[Engine]   deep_research_iterative : ${breakdown.deep_research_iterative   ?? 0} signaux`)
  log(`[Engine]   TOTAL                   : ${allSignals.length} signaux en ${durationMs}ms`)

  return { allSignals, breakdown, durationMs, errors }
}
