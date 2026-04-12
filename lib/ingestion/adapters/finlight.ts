// ============================================================================
// Finlight adapter — real-time financial/geopolitical news with sentiment
// Auth: API key via FINLIGHT_API_KEY
// Endpoints: REST /articles, optional WebSocket future
// Sync: polling (every 15–30 min), WebSocket phase 2
// Rate limit: ~60 req/min
// Dedup: Finlight article ID + canonical URL
// ============================================================================

import type { SourceAdapter, FetchParams, FetchResult, DedupKeySet, AdapterCapabilities } from '../adapter'
import type { NormalizedSignal } from '../types'
import { hashTitle, canonicalizeUrl, extractDomain, safeIso, clamp01, truncate } from '../utils'

const BASE_URL = 'https://api.finlight.me/v1'

export class FinlightAdapter implements SourceAdapter {
  readonly providerId = 'finlight' as const
  readonly capabilities: AdapterCapabilities = {
    supports_news: true,
    supports_markets: false,
    supports_streaming: true,
    supports_backfill: true,
  }

  private get apiKey(): string | null {
    return process.env.FINLIGHT_API_KEY ?? null
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const res = await fetch(`${BASE_URL}/articles?limit=1`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      return res.ok
    } catch {
      return false
    }
  }

  async fetch(params: FetchParams): Promise<FetchResult> {
    const key = this.apiKey
    if (!key) return { items: [], cursor_state: null, has_more: false }

    const qp = new URLSearchParams({ limit: String(params.max_items ?? 50) })

    if (params.keywords?.length) qp.set('query', params.keywords.join(' '))
    if (params.languages?.length) qp.set('language', params.languages[0])
    if (params.since) qp.set('from', params.since)

    const offset = (params.cursor as any)?.offset ?? 0
    if (offset) qp.set('offset', String(offset))

    const res = await fetch(`${BASE_URL}/articles?${qp}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`Finlight HTTP ${res.status}: ${await res.text().catch(() => '')}`)

    const json = await res.json()
    const articles = json.articles ?? json.data ?? json ?? []
    const arr = Array.isArray(articles) ? articles : []

    return {
      items: arr,
      cursor_state: arr.length >= (params.max_items ?? 50) ? { offset: offset + arr.length } : null,
      has_more: arr.length >= (params.max_items ?? 50),
    }
  }

  normalizeSignal(raw: unknown): NormalizedSignal | null {
    const r = raw as Record<string, any>
    if (!r.title) return null

    const url = r.url ?? r.link ?? null
    const sentimentVal = typeof r.sentiment === 'number' ? clamp01(r.sentiment) : null
    const mappedSentiment = sentimentVal != null ? (sentimentVal - 0.5) * 2 : null

    return {
      provider_id: 'finlight',
      external_id: r.id ?? r.article_id ?? null,
      title: r.title,
      summary: truncate(r.summary ?? r.description, 1000),
      body_excerpt: truncate(r.content ?? r.body, 2000),
      url,
      image_url: r.image ?? r.image_url ?? null,
      published_at: safeIso(r.publishedAt ?? r.published_at ?? r.date),
      language: r.language ?? 'en',
      source_name: r.source?.name ?? r.source_name ?? null,
      source_domain: url ? extractDomain(url) : null,
      authors: r.author ? [r.author] : [],
      geography: r.countries ?? r.regions ?? [],
      entity_tags: r.entities?.map((e: any) => e.name ?? e) ?? [],
      category_tags: r.categories ?? (r.category ? [r.category] : []),
      sentiment: mappedSentiment,
      signal_type: 'financial_news',
      source_type: 'article',
      trust_score: 0.65,
      novelty_score: null,
      relevance_score: clamp01(r.relevance_score),
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
