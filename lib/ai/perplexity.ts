/**
 * lib/ai/perplexity.ts
 * Client Perplexity — Responses API (/v1/responses) + Search API (/search).
 *
 * Responses API (endpoint principal) :
 *   POST /v1/responses  { preset: "fast-search", input: "..." }
 *   → output[0]: search_results (URLs)
 *   → output[1]: message → content[0].text (synthèse avec citations inline [1][2])
 *   → top-level: text (raccourci)
 *
 * Search API (fallback) :
 *   POST /search { query, max_results, max_tokens_per_page, search_domain_filter, ... }
 *   → results[]: {title, url, snippet}
 *
 * Filtres supportés (Search + Responses) :
 *   - search_domain_filter  : max 20 domaines (allowlist OU denylist avec prefix -)
 *   - search_recency_filter : hour | day | week | month | year
 *   - search_language_filter: ISO 639-1 codes (fr, en, …)
 *   - country               : ISO 3166-1 alpha-2 (CI, SN, GH, …)
 */

const PERPLEXITY_BASE = 'https://api.perplexity.ai'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PerplexityCitation {
  url:   string
  title: string
}

export interface PerplexityResponseResult {
  text:      string
  citations: PerplexityCitation[]
}

export interface PerplexitySearchResult {
  title:         string
  url:           string
  snippet:       string
  date?:         string | null
}

export type SearchRecency = 'hour' | 'day' | 'week' | 'month' | 'year'

export interface PerplexityFilters {
  domains?:   string[]
  recency?:   SearchRecency
  languages?: string[]
  country?:   string
}

// ── Responses API (principal) ─────────────────────────────────────────────────

/**
 * Appel à la Perplexity Responses API.
 * Retourne une réponse synthétisée + URLs sources.
 * Accepte des filtres optionnels (domaines, récence) via l'objet tools.
 */
export async function perplexityResponses(
  input:   string,
  filters?: PerplexityFilters,
): Promise<PerplexityResponseResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')

  const body: Record<string, any> = { preset: 'fast-search', input }

  const hasFilters = filters?.domains?.length || filters?.recency
  if (hasFilters) {
    const toolFilters: Record<string, any> = {}
    if (filters!.domains?.length)  toolFilters.search_domain_filter  = filters!.domains.slice(0, 20)
    if (filters!.recency)          toolFilters.search_recency_filter = filters!.recency
    body.tools = [{ type: 'web_search', filters: toolFilters }]
  }

  const res = await fetch(`${PERPLEXITY_BASE}/v1/responses`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Perplexity Responses API ${res.status}: ${err}`)
  }

  const data = await res.json()

  // ── Extraire le texte ─────────────────────────────────────────────────
  // Priorité : top-level `text` > output[message].content[output_text].text
  let text = ''
  // Priorité 1 : champ top-level
  if (typeof data.text === 'string' && data.text.length > 0) {
    text = data.text
  } else {
    // Priorité 2 : output[message].content[output_text].text
    const outputMsg   = data.output?.find((o: any) => o.type === 'message')
    const contentPart = outputMsg?.content?.find((c: any) => c.type === 'output_text')
    text = typeof contentPart?.text === 'string' ? contentPart.text : ''
  }

  // ── Extraire les citations/URLs ───────────────────────────────────────
  // Source 1 : output[search_results].results[]
  const searchOutput = data.output?.find((o: any) => o.type === 'search_results')
  const searchResults: any[] = searchOutput?.results ?? []

  // Source 2 : annotations sur output_text (certaines versions de l'API)
  const outputMsg2   = data.output?.find((o: any) => o.type === 'message')
  const contentPart2 = outputMsg2?.content?.find((c: any) => c.type === 'output_text')
  const annotations: any[] = contentPart2?.annotations ?? []

  const citations: PerplexityCitation[] = []

  // D'abord les search_results (plus fiable)
  for (const r of searchResults) {
    const url   = r.url ?? r.link ?? ''
    const title = r.title ?? r.name ?? ''
    if (url && !citations.some(c => c.url === url)) {
      citations.push({ url, title })
    }
  }

  // Puis les annotations (complémentaire)
  for (const a of annotations) {
    if (a.url && !citations.some(c => c.url === a.url)) {
      citations.push({ url: a.url, title: a.title ?? '' })
    }
  }

  return { text, citations }
}

// ── Search API (fallback) ─────────────────────────────────────────────────────

export async function perplexitySearch(
  query: string,
  options: {
    maxResults?:       number
    maxTokensPerPage?: number
    filters?:          PerplexityFilters
  } = {},
): Promise<PerplexitySearchResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')

  const body: Record<string, any> = {
    query,
    max_results:         options.maxResults       ?? 5,
    max_tokens_per_page: options.maxTokensPerPage ?? 512,
  }

  if (options.filters?.domains?.length)   body.search_domain_filter   = options.filters.domains.slice(0, 20)
  if (options.filters?.recency)           body.search_recency_filter  = options.filters.recency
  if (options.filters?.languages?.length) body.search_language_filter = options.filters.languages
  if (options.filters?.country)           body.country                = options.filters.country

  const res = await fetch(`${PERPLEXITY_BASE}/search`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Perplexity Search API ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.results ?? []
}

// ── Embeddings API ───────────────────────────────────────────────────────────

export async function perplexityEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')
  if (texts.length === 0) return []

  const res = await fetch(`${PERPLEXITY_BASE}/v1/embeddings`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
    },
    body:   JSON.stringify({ input: texts, model: 'pplx-embed-v1-4b' }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Perplexity Embeddings API ${res.status}: ${err}`)
  }

  const data = await res.json()
  return (data.data as { index: number; embedding: number[] }[])
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ── Adaptateur pour collector-engine ─────────────────────────────────────────

/**
 * Interface unifiée pour le collector-engine.
 * Essaie Responses API d'abord, puis /search en fallback.
 * Propage les filtres (domaines, récence, langue, pays) aux deux APIs.
 */
export async function perplexityWebSearch(
  query:      string,
  maxResults = 3,
  filters?:  PerplexityFilters,
): Promise<{ title: string; url: string; snippet: string; fullContent?: string }[]> {
  // ── Niveau 1 : Responses API ────────────────────────────────────────────────
  try {
    const { text, citations } = await perplexityResponses(query, filters)

    if (text && text.length > 100) {
      const sources = citations.slice(0, maxResults)

      if (sources.length > 0) {
        return sources.map((c, i) => ({
          title:       c.title || `Source ${i + 1}`,
          url:         c.url,
          snippet:     text.slice(0, 300),
          fullContent: text,
        }))
      }

      return [{
        title:       query.slice(0, 80),
        url:         `https://perplexity.ai/search?q=${encodeURIComponent(query)}`,
        snippet:     text.slice(0, 300),
        fullContent: text,
      }]
    }
  } catch {
    // Fallback /search
  }

  // ── Niveau 2 : Search API ────────────────────────────────────────────────────
  try {
    const results = await perplexitySearch(query, {
      maxResults,
      maxTokensPerPage: 512,
      filters,
    })

    return results.map(r => ({
      title:       r.title,
      url:         r.url,
      snippet:     r.snippet,
      fullContent: r.snippet && r.snippet.length > 80 ? r.snippet : undefined,
    }))
  } catch {
    return []
  }
}
