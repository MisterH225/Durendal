// ============================================================================
// NewsData.io adapter — broad general news coverage
// Auth: API key via NEWSDATA_API_KEY
// Endpoints: /latest, /archive, /crypto, /news (market)
// Sync: polling (scheduled every 30–60 min)
// Rate limit: 30 req/min free, 200/day
// Dedup: article_id from NewsData + canonical URL
// ============================================================================

import type { SourceAdapter, FetchParams, FetchResult, DedupKeySet, AdapterCapabilities } from '../adapter'
import type { NormalizedSignal } from '../types'
import { hashTitle, canonicalizeUrl, extractDomain, safeIso, clamp01, truncate } from '../utils'

const BASE_URL = 'https://newsdata.io/api/1'

export class NewsDataAdapter implements SourceAdapter {
  readonly providerId = 'newsdata' as const
  readonly capabilities: AdapterCapabilities = {
    supports_news: true,
    supports_markets: false,
    supports_streaming: false,
    supports_backfill: true,
  }

  private get apiKey(): string | null {
    return process.env.NEWSDATA_API_KEY ?? null
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const res = await fetch(`${BASE_URL}/latest?apikey=${this.apiKey}&language=en&size=1`)
      return res.ok
    } catch {
      return false
    }
  }

  async fetch(params: FetchParams): Promise<FetchResult> {
    const key = this.apiKey
    if (!key) return { items: [], cursor_state: null, has_more: false }

    const endpoint = params.flow_type === 'news_financial' ? '/latest' : '/latest'
    const qp = new URLSearchParams({ apikey: key, size: String(params.max_items ?? 50) })

    if (params.keywords?.length) qp.set('q', params.keywords.join(' OR '))
    if (params.languages?.length) qp.set('language', params.languages.join(','))
    if (params.countries?.length) qp.set('country', params.countries.join(','))
    if (params.categories?.length) qp.set('category', params.categories.join(','))
    if (params.flow_type === 'news_financial') qp.set('category', 'business')

    const page = (params.cursor as any)?.nextPage ?? null
    if (page) qp.set('page', page)

    const res = await fetch(`${BASE_URL}${endpoint}?${qp}`)
    if (!res.ok) throw new Error(`NewsData HTTP ${res.status}: ${await res.text().catch(() => '')}`)

    const json = await res.json()
    const results = json.results ?? []

    return {
      items: results,
      cursor_state: json.nextPage ? { nextPage: json.nextPage } : null,
      has_more: Boolean(json.nextPage),
    }
  }

  normalizeSignal(raw: unknown): NormalizedSignal | null {
    const r = raw as Record<string, any>
    if (!r.title) return null

    const url = r.link ?? r.source_url ?? null

    return {
      provider_id: 'newsdata',
      external_id: r.article_id ?? null,
      title: r.title,
      summary: truncate(r.description, 1000),
      body_excerpt: truncate(r.content, 2000),
      url,
      image_url: r.image_url ?? null,
      published_at: safeIso(r.pubDate),
      language: r.language ?? null,
      source_name: r.source_name ?? r.source_id ?? null,
      source_domain: url ? extractDomain(url) : null,
      authors: Array.isArray(r.creator) ? r.creator : r.creator ? [r.creator] : [],
      geography: Array.isArray(r.country) ? r.country : r.country ? [r.country] : [],
      entity_tags: [],
      category_tags: Array.isArray(r.category) ? r.category : r.category ? [r.category] : [],
      sentiment: r.sentiment === 'positive' ? 0.6 : r.sentiment === 'negative' ? -0.6 : 0,
      signal_type: 'news',
      source_type: 'article',
      trust_score: 0.55,
      novelty_score: null,
      relevance_score: null,
      market_probability: null,
      market_volume: null,
      market_id: null,
      dedup_hash: hashTitle(r.title),
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
