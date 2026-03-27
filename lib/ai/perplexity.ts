/**
 * lib/ai/perplexity.ts
 * Client Perplexity Search API — endpoint dédié /search.
 *
 * Contrairement au Sonar API (chat completions), la Search API :
 *   - Retourne des résultats structurés {title, url, snippet, date}
 *   - Pas d'inférence LLM → plus rapide et moins cher
 *   - Fonctionne depuis n'importe quel VPS/datacenter
 *
 * Docs : https://docs.perplexity.ai/api-reference/search-post
 */

const PERPLEXITY_BASE = 'https://api.perplexity.ai'

export interface PerplexitySearchResult {
  title:        string
  url:          string
  snippet:      string
  date?:        string | null
  last_updated?: string | null
}

export interface PerplexitySearchResponse {
  results: PerplexitySearchResult[]
  id:          string
  server_time?: string | null
}

/**
 * Recherche via la Perplexity Search API.
 * Retourne des résultats web structurés, prêts à être utilisés dans les agents.
 *
 * @param query              Requête de recherche
 * @param options.maxResults Nombre max de résultats (1–20, défaut 5)
 * @param options.recency    Filtre temporel : 'day' | 'week' | 'month' | 'year'
 * @param options.language   Filtre langue ISO 639-1, ex: ['fr', 'en']
 * @param options.domains    Limiter à des domaines spécifiques
 */
export async function perplexitySearch(
  query: string,
  options: {
    maxResults?:       number
    maxTokensPerPage?: number
    recency?:          'hour' | 'day' | 'week' | 'month' | 'year'
    language?:         string[]
    domains?:          string[]
  } = {},
): Promise<PerplexitySearchResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')

  const body: Record<string, any> = {
    query,
    max_results:          options.maxResults       ?? 5,
    max_tokens_per_page:  options.maxTokensPerPage ?? 512,
  }

  if (options.recency)           body.search_recency_filter   = options.recency
  if (options.language?.length)  body.search_language_filter  = options.language
  if (options.domains?.length)   body.search_domain_filter    = options.domains

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

  const data: PerplexitySearchResponse = await res.json()
  return data.results ?? []
}

/**
 * Variante adaptée au format webSearch() du collector-engine.
 * Retourne {title, url, snippet} directement utilisables par les agents.
 * Le snippet contient du contenu extrait de la page → skip fetchPageContent.
 */
export async function perplexityWebSearch(
  query:      string,
  maxResults = 3,
): Promise<{ title: string; url: string; snippet: string; fullContent?: string }[]> {
  try {
    const results = await perplexitySearch(query, {
      maxResults,
      maxTokensPerPage: 512,   // ~400 mots — suffisant pour l'extraction Gemini
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
