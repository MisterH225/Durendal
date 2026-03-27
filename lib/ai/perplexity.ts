/**
 * lib/ai/perplexity.ts
 * Client Perplexity API — modèle `sonar` (recherche web avec citations).
 *
 * Perplexity fait la recherche web sur SES propres serveurs → fonctionne
 * depuis n'importe quel VPS/datacenter, contrairement au scraping DDG direct.
 *
 * Docs : https://docs.perplexity.ai/api-reference/chat-completions
 */

const PERPLEXITY_BASE = 'https://api.perplexity.ai'

export interface PerplexityResult {
  /** Texte de synthèse complet avec citations inline [1], [2]... */
  content:    string
  /** URLs des sources citées (dans l'ordre des citations) */
  citations:  string[]
  /** Nombre de tokens utilisés */
  tokensUsed: number
}

/**
 * Recherche Perplexity — envoie une requête et retourne une synthèse + sources.
 *
 * @param query    Requête de recherche en langage naturel
 * @param options  model: 'sonar' (rapide/gratuit) | 'sonar-pro' (plus précis)
 */
export async function perplexitySearch(
  query:   string,
  options: { model?: 'sonar' | 'sonar-pro'; maxTokens?: number } = {},
): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY manquant')

  const model     = options.model     ?? 'sonar'
  const maxTokens = options.maxTokens ?? 1_500

  const res = await fetch(`${PERPLEXITY_BASE}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role:    'system',
          content: 'Tu es un assistant de veille économique spécialisé sur les marchés africains. Réponds de façon factuelle et concise avec des informations récentes vérifiables.',
        },
        {
          role:    'user',
          content: query,
        },
      ],
      max_tokens:          maxTokens,
      temperature:         0.1,   // réponses factuelles, peu créatives
      return_citations:    true,
      return_images:       false,
      search_recency_filter: 'month', // actualités du mois en priorité
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Perplexity API ${res.status}: ${err}`)
  }

  const data      = await res.json()
  const content   = data.choices?.[0]?.message?.content ?? ''
  const citations = (data.citations ?? []) as string[]
  const tokensUsed = (data.usage?.total_tokens ?? 0) as number

  return { content, citations, tokensUsed }
}

/**
 * Variante "multi-source" : effectue la recherche ET retourne les résultats
 * dans le format attendu par webSearch() {title, url, snippet}.
 *
 * Utilisé comme fallback dans collector-engine.ts.
 */
export async function perplexityWebSearch(
  query:      string,
  maxResults = 3,
): Promise<{ title: string; url: string; snippet: string; fullContent?: string }[]> {
  try {
    const { content, citations } = await perplexitySearch(query)
    if (!content || citations.length === 0) return []

    // Chaque citation devient un résultat de recherche
    // Le contenu complet de Perplexity est attaché au premier résultat
    return citations.slice(0, maxResults).map((url, i) => {
      let hostname = url
      try { hostname = new URL(url).hostname.replace('www.', '') } catch {}
      return {
        title:       hostname,
        url,
        snippet:     content.slice(0, 300), // snippet = début de la synthèse
        fullContent: i === 0 ? content : undefined, // contenu complet sur le 1er
      }
    })
  } catch {
    return []
  }
}
