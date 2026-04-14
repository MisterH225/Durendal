/**
 * lib/ai/perplexity.ts
 * Client Perplexity — Sonar API (/v1/sonar) + Search API (/search).
 *
 * Sonar API (endpoint principal, Chat Completions format) :
 *   POST /v1/sonar  { model, messages, search_recency_filter, ... }
 *   → choices[0].message.content  (texte synthétisé)
 *   → citations[]                 (URLs sources)
 *   → search_results[]            (résultats enrichis)
 *
 * Search API (résultats bruts) :
 *   POST /search { query, max_results, ... }
 *   → results[]: {title, url, snippet}
 *
 * Filtres Sonar (top-level params) :
 *   - search_domain_filter  : max 20 domaines
 *   - search_recency_filter : day | week | month | year
 *   - search_language_filter: ISO 639-1 codes (fr, en, …)
 *   - web_search_options    : { search_context_size, user_location }
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

// ── Sonar API (Chat Completions — principal) ──────────────────────────────────

/**
 * Appel à la Perplexity Sonar API (format Chat Completions).
 * Utilise `sonar-pro` avec `search_context_size: "high"` pour maximiser
 * la quantité d'information récupérée par la recherche temps réel.
 */
/** Quota / facturation Perplexity épuisée (401 insufficient_quota). */
export class PerplexityQuotaError extends Error {
  constructor(message = 'Perplexity: quota ou facturation insuffisante (401). Voir https://www.perplexity.ai/settings/api') {
    super(message)
    this.name = 'PerplexityQuotaError'
  }
}

export function isPerplexityQuotaError(err: unknown): boolean {
  if (err instanceof PerplexityQuotaError) return true
  if (err instanceof Error) {
    return /insufficient_quota|exceeded your current quota|PerplexityQuotaError/i.test(err.message)
  }
  return false
}

export async function perplexityResponses(
  input:   string,
  filters?: PerplexityFilters,
): Promise<PerplexityResponseResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')

  const body: Record<string, any> = {
    model: 'sonar-pro',
    messages: [
      {
        role: 'system',
        content: 'Tu es un expert en veille concurrentielle et intelligence économique. Fournis des informations détaillées, factuelles et sourcées. Privilégie les données chiffrées, les dates et les faits vérifiables.',
      },
      { role: 'user', content: input },
    ],
    web_search_options: {
      search_context_size: 'high',
    },
  }

  if (filters?.recency)            body.search_recency_filter  = filters.recency
  if (filters?.languages?.length)  body.search_language_filter = filters.languages
  if (filters?.domains?.length)    body.search_domain_filter   = filters.domains.slice(0, 20)

  if (filters?.country) {
    body.web_search_options.user_location = { country: filters.country }
  }

  const res = await fetch(`${PERPLEXITY_BASE}/v1/sonar`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.statusText)
    if (res.status === 401) {
      try {
        const parsed = JSON.parse(errBody) as { error?: { type?: string } }
        if (parsed?.error?.type === 'insufficient_quota') {
          throw new PerplexityQuotaError()
        }
      } catch (e) {
        if (e instanceof PerplexityQuotaError) throw e
      }
      if (/insufficient_quota|exceeded your current quota/i.test(errBody)) {
        throw new PerplexityQuotaError()
      }
    }
    throw new Error(`Perplexity Sonar API ${res.status}: ${errBody}`)
  }

  const data = await res.json()

  // ── Extraire le texte ─────────────────────────────────────────────────
  let text = ''
  if (data.choices?.[0]?.message?.content) {
    text = data.choices[0].message.content
  } else if (typeof data.text === 'string') {
    text = data.text
  } else {
    const outputMsg   = data.output?.find((o: any) => o.type === 'message')
    const contentPart = outputMsg?.content?.find((c: any) => c.type === 'output_text')
    text = typeof contentPart?.text === 'string' ? contentPart.text : ''
  }

  // ── Extraire les citations/URLs ───────────────────────────────────────
  const citations: PerplexityCitation[] = []

  // Source 1 : top-level citations array (Sonar format)
  if (Array.isArray(data.citations)) {
    for (const c of data.citations) {
      const url = typeof c === 'string' ? c : c?.url ?? ''
      if (url && !citations.some(x => x.url === url)) {
        citations.push({ url, title: typeof c === 'object' ? c.title ?? '' : '' })
      }
    }
  }

  // Source 2 : search_results (Sonar Pro format enrichi)
  if (Array.isArray(data.search_results)) {
    for (const r of data.search_results) {
      const url = r.url ?? r.link ?? ''
      if (url && !citations.some(c => c.url === url)) {
        citations.push({ url, title: r.title ?? r.name ?? '' })
      }
    }
  }

  // Source 3 : output[search_results] (ancien format)
  const searchOutput = data.output?.find((o: any) => o.type === 'search_results')
  if (searchOutput?.results) {
    for (const r of searchOutput.results) {
      const url = r.url ?? r.link ?? ''
      if (url && !citations.some(c => c.url === url)) {
        citations.push({ url, title: r.title ?? '' })
      }
    }
  }

  // Source 4 : annotations inline
  const outputMsg2   = data.output?.find((o: any) => o.type === 'message')
  const contentPart2 = outputMsg2?.content?.find((c: any) => c.type === 'output_text')
  const annotations: any[] = contentPart2?.annotations ?? []
  for (const a of annotations) {
    if (a.url && !citations.some(c => c.url === a.url)) {
      citations.push({ url: a.url, title: a.title ?? '' })
    }
  }

  console.log(`[perplexity] Sonar: ${text.length} chars, ${citations.length} citations`)

  return { text, citations }
}

// ── Search API (résultats bruts) ─────────────────────────────────────────────

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
    max_tokens_per_page: options.maxTokensPerPage ?? 1024,
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

export interface EnrichedSearchResult {
  title:        string
  url:          string
  snippet:      string
  fullContent?: string
  citations?:   PerplexityCitation[]
}

export async function perplexityWebSearch(
  query:      string,
  maxResults = 3,
  filters?:  PerplexityFilters,
): Promise<EnrichedSearchResult[]> {
  // ── Niveau 1 : Sonar API (synthèse + citations temps réel) ─────────────────
  try {
    const { text, citations } = await perplexityResponses(query, filters)

    if (text && text.length > 100) {
      const results: EnrichedSearchResult[] = []

      // Résultat principal : texte synthétisé complet + toutes les citations
      results.push({
        title:       citations[0]?.title || query.slice(0, 80),
        url:         citations[0]?.url   || `https://perplexity.ai/search?q=${encodeURIComponent(query)}`,
        snippet:     text.slice(0, 300),
        fullContent: text,
        citations:   citations.slice(0, 20),
      })

      // Résultats complémentaires : citations individuelles pour extraction
      for (const cit of citations.slice(1, maxResults + 1)) {
        if (cit.url && !results.some(r => r.url === cit.url)) {
          results.push({
            title:   cit.title || cit.url,
            url:     cit.url,
            snippet: '',
          })
        }
      }

      return results
    }
  } catch (e: any) {
    console.warn(`[perplexity] Sonar fallback: ${e?.message}`)
  }

  // ── Niveau 2 : Search API (résultats bruts) ────────────────────────────────
  try {
    const results = await perplexitySearch(query, {
      maxResults: maxResults + 2,
      maxTokensPerPage: 1024,
      filters,
    })

    return results.map(r => ({
      title:       r.title,
      url:         r.url,
      snippet:     r.snippet,
      fullContent: r.snippet && r.snippet.length > 80 ? r.snippet : undefined,
    }))
  } catch (e: any) {
    console.warn(`[perplexity] Search API fallback: ${e?.message}`)
    return []
  }
}
