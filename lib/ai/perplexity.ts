/**
 * lib/ai/perplexity.ts
 * Client Perplexity — Responses API (/v1/responses) + Search API (/search).
 *
 * Responses API (endpoint principal) :
 *   POST /v1/responses
 *   preset: "fast-search" | "quality-search"
 *   → retourne une réponse synthétisée + annotations (citations URL)
 *   → 1 seul appel = recherche web + synthèse → idéal pour agents
 *
 * Search API (fallback) :
 *   POST /search
 *   → retourne des résultats structurés {title, url, snippet}
 */

const PERPLEXITY_BASE = 'https://api.perplexity.ai'

// ── Types : Responses API ─────────────────────────────────────────────────────

export interface PerplexityUrlCitation {
  type:        'url_citation'
  url:         string
  title:       string
  start_index?: number
  end_index?:   number
}

export interface PerplexityResponseResult {
  text:      string
  citations: PerplexityUrlCitation[]
}

// ── Types : Search API ────────────────────────────────────────────────────────

export interface PerplexitySearchResult {
  title:         string
  url:           string
  snippet:       string
  date?:         string | null
  last_updated?: string | null
}

// ── Responses API (principal) ─────────────────────────────────────────────────

/**
 * Appel à la Perplexity Responses API.
 * Retourne une réponse synthétisée + citations web.
 *
 * @param input   Requête / question pour l'agent
 * @param preset  "fast-search" (rapide) | "quality-search" (meilleure qualité)
 */
export async function perplexityResponses(
  input:  string,
  preset: 'fast-search' | 'quality-search' = 'fast-search',
): Promise<PerplexityResponseResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')

  const res = await fetch(`${PERPLEXITY_BASE}/v1/responses`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${apiKey}`,
    },
    body:   JSON.stringify({ preset, input }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Perplexity Responses API ${res.status}: ${err}`)
  }

  const data = await res.json()

  // Extrait le texte synthétisé depuis output[].content[].text
  const outputMsg   = data.output?.find((o: any) => o.type === 'message')
  const contentPart = outputMsg?.content?.find((c: any) => c.type === 'output_text')
  const text        = contentPart?.text ?? data.output_text ?? data.text ?? ''

  // Extrait les citations (annotations de type url_citation)
  const annotations: any[] = contentPart?.annotations ?? data.annotations ?? []
  const citations: PerplexityUrlCitation[] = annotations
    .filter((a: any) => a.type === 'url_citation' && a.url)
    .map((a: any) => ({
      type:  'url_citation' as const,
      url:   a.url,
      title: a.title ?? '',
    }))
    // Déduplique par URL
    .filter((c, i, arr) => arr.findIndex(x => x.url === c.url) === i)

  return { text, citations }
}

// ── Search API (fallback) ─────────────────────────────────────────────────────

/**
 * Appel à la Perplexity Search API (fallback si /v1/responses échoue).
 * Retourne des résultats web structurés {title, url, snippet}.
 */
export async function perplexitySearch(
  query: string,
  options: {
    maxResults?:       number
    maxTokensPerPage?: number
    recency?:          'hour' | 'day' | 'week' | 'month' | 'year'
  } = {},
): Promise<PerplexitySearchResult[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')

  const body: Record<string, any> = {
    query,
    max_results:         options.maxResults       ?? 5,
    max_tokens_per_page: options.maxTokensPerPage ?? 512,
  }
  if (options.recency) body.search_recency_filter = options.recency

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

/**
 * Génère des vecteurs d'embeddings pour un tableau de textes.
 * Modèle : pplx-embed-v1-4b (4 milliards de paramètres, performant pour similarité sémantique)
 *
 * Retourne un tableau de vecteurs float[] dans le même ordre que l'input.
 * Utile pour filtrer les résultats de recherche par pertinence avant appel Gemini.
 */
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
  // Format : { data: [{ index: 0, embedding: number[] }, ...] }
  return (data.data as { index: number; embedding: number[] }[])
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding)
}

/**
 * Similarité cosinus entre deux vecteurs.
 * Retourne une valeur entre -1 (opposés) et 1 (identiques).
 * Seuil recommandé pour filtrage de pertinence : 0.15–0.25
 */
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
 * Essaie Responses API (/v1/responses) en premier, puis /search en fallback.
 *
 * Retourne des SearchResult avec :
 *   - fullContent : texte synthétisé (riche, ~500 mots) → skip fetchPageContent
 *   - url/title  : première citation si disponible, sinon URL factice
 */
export async function perplexityWebSearch(
  query:      string,
  maxResults = 3,
): Promise<{ title: string; url: string; snippet: string; fullContent?: string }[]> {
  // ── Niveau 1 : Responses API ────────────────────────────────────────────────
  try {
    const { text, citations } = await perplexityResponses(query, 'fast-search')

    if (text && text.length > 100) {
      // La réponse synthétisée est le contenu principal
      // Les citations deviennent les "résultats" individuels (max maxResults)
      const sources = citations.slice(0, maxResults)

      if (sources.length > 0) {
        // Un résultat par citation, tous avec le même contenu synthétisé
        return sources.map((c, i) => ({
          title:       c.title || `Source ${i + 1}`,
          url:         c.url,
          snippet:     text.slice(0, 300),
          fullContent: text,  // texte complet partagé entre toutes les sources
        }))
      }

      // Réponse sans citation — on retourne un résultat synthétique
      return [{
        title:       query.slice(0, 80),
        url:         `https://perplexity.ai/search?q=${encodeURIComponent(query)}`,
        snippet:     text.slice(0, 300),
        fullContent: text,
      }]
    }
  } catch {
    // Silence — tombe en fallback /search
  }

  // ── Niveau 2 : Search API ────────────────────────────────────────────────────
  try {
    const results = await perplexitySearch(query, {
      maxResults,
      maxTokensPerPage: 512,
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
