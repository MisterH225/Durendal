// ============================================================================
// Perplexity Sonar adapter — AI-powered real-time news search
// Auth: API key via PERPLEXITY_API_KEY (already used elsewhere in the platform)
// Endpoints: Sonar API /v1/sonar (synthesis + citations), Search API /search
// Sync: polling (every 30 min alongside other news providers)
// Rate limit: varies by plan; adapter uses Search API for lower cost per call
// Dedup: citation URL (canonical) + title hash
//
// Unlike traditional news APIs, Perplexity returns AI-synthesized summaries
// backed by real-time web search citations. Each citation becomes a signal.
// The synthesis itself is preserved as body_excerpt for context.
// ============================================================================

import type { SourceAdapter, FetchParams, FetchResult, DedupKeySet, AdapterCapabilities } from '../adapter'
import type { NormalizedSignal } from '../types'
import { hashTitle, canonicalizeUrl, extractDomain, safeIso, truncate } from '../utils'

const PERPLEXITY_BASE = 'https://api.perplexity.ai'

export class PerplexityAdapter implements SourceAdapter {
  readonly providerId = 'perplexity' as const
  readonly capabilities: AdapterCapabilities = {
    supports_news: true,
    supports_markets: false,
    supports_streaming: false,
    supports_backfill: false,
  }

  private get apiKey(): string | null {
    return process.env.PERPLEXITY_API_KEY ?? null
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const res = await fetch(`${PERPLEXITY_BASE}/v1/sonar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: AbortSignal.timeout(10_000),
      })
      return res.ok || res.status === 400
    } catch {
      return false
    }
  }

  async fetch(params: FetchParams): Promise<FetchResult> {
    const key = this.apiKey
    if (!key) return { items: [], cursor_state: null, has_more: false }

    const queries = this.buildQueries(params)
    const allItems: unknown[] = []

    for (const query of queries) {
      try {
        const items = await this.fetchSonar(key, query, params)
        allItems.push(...items)
      } catch (e) {
        console.warn(`[perplexity-adapter] Query failed: "${query.slice(0, 60)}":`, e instanceof Error ? e.message : e)
      }
      // Respect rate limits between queries
      if (queries.length > 1) await new Promise(r => setTimeout(r, 500))
    }

    return {
      items: allItems.slice(0, params.max_items ?? 50),
      cursor_state: null,
      has_more: false,
    }
  }

  private buildQueries(params: FetchParams): string[] {
    if (params.keywords?.length) {
      return params.keywords.map(kw => `Latest news: ${kw}`)
    }

    const queries: string[] = []

    if (params.flow_type === 'news_financial') {
      queries.push(
        'Breaking financial market news today: major economic events, central bank decisions, geopolitical developments affecting markets',
        'Latest corporate news: M&A, earnings surprises, major partnerships, regulatory changes',
      )
    } else {
      queries.push(
        'Most important breaking news today: global events, politics, economy, technology, conflicts',
        'Latest geopolitical developments and international news today',
      )
    }

    return queries
  }

  private async fetchSonar(apiKey: string, query: string, params: FetchParams): Promise<unknown[]> {
    const body: Record<string, any> = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a news intelligence analyst. Return factual, sourced information about current events. Be concise and cite sources.',
        },
        { role: 'user', content: query },
      ],
      web_search_options: { search_context_size: 'high' },
      search_recency_filter: 'day',
    }

    if (params.languages?.length) {
      body.search_language_filter = params.languages
    }

    const res = await fetch(`${PERPLEXITY_BASE}/v1/sonar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      throw new Error(`Perplexity Sonar ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content ?? data.text ?? ''

    // Extract citations from all possible response formats
    const citations: Array<{ url: string; title: string }> = []
    const seen = new Set<string>()

    // Sonar top-level citations
    if (Array.isArray(data.citations)) {
      for (const c of data.citations) {
        const url = typeof c === 'string' ? c : c?.url ?? ''
        if (url && !seen.has(url)) {
          seen.add(url)
          citations.push({ url, title: typeof c === 'object' ? c.title ?? '' : '' })
        }
      }
    }

    // search_results (Sonar Pro enriched)
    if (Array.isArray(data.search_results)) {
      for (const r of data.search_results) {
        const url = r.url ?? r.link ?? ''
        if (url && !seen.has(url)) {
          seen.add(url)
          citations.push({ url, title: r.title ?? '' })
        }
      }
    }

    // Return each citation as an item, with the synthesis text as shared context
    return citations.map(cit => ({
      _type: 'perplexity_citation',
      url: cit.url,
      title: cit.title,
      synthesis: text,
      query,
      published_at: new Date().toISOString(),
    }))
  }

  normalizeSignal(raw: unknown): NormalizedSignal | null {
    const r = raw as Record<string, any>
    if (!r.url && !r.title) return null

    const url = r.url ?? null
    const title = r.title || (url ? `Perplexity citation: ${url}` : null)
    if (!title) return null

    const domain = url ? extractDomain(url) : null

    return {
      provider_id: 'perplexity',
      external_id: url ? canonicalizeUrl(url) : null,
      title,
      summary: truncate(r.synthesis, 1000),
      body_excerpt: truncate(r.synthesis, 2000),
      url,
      image_url: null,
      published_at: safeIso(r.published_at),
      language: null,
      source_name: domain ?? 'Perplexity Sonar',
      source_domain: domain,
      authors: [],
      geography: [],
      entity_tags: [],
      category_tags: [],
      sentiment: null,
      signal_type: r.query?.toLowerCase().includes('financial') || r.query?.toLowerCase().includes('market')
        ? 'financial_news'
        : 'news',
      source_type: 'article',
      trust_score: 0.60,
      novelty_score: 0.7,
      relevance_score: null,
      market_probability: null,
      market_volume: null,
      market_id: null,
      dedup_hash: hashTitle(title),
    }
  }

  dedupKeys(signal: NormalizedSignal): DedupKeySet {
    return {
      canonical_url: signal.url ? canonicalizeUrl(signal.url) : null,
      title_hash: signal.dedup_hash,
      provider_external_id: signal.external_id,
      market_key: null,
    }
  }
}
