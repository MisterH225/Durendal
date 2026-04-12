// ============================================================================
// Dome / Unified Prediction Market adapter — STUB
//
// This adapter provides the abstraction layer for:
// - Dome API (when credentials are available)
// - Future Kalshi integration
// - Any unified prediction market aggregator
//
// Auth: API key via DOME_API_KEY (or KALSHI_API_KEY for direct Kalshi)
// Sync: polling
// Status: STUB — returns empty data, ready for wiring when access is granted.
// ============================================================================

import type { SourceAdapter, FetchParams, FetchResult, DedupKeySet, AdapterCapabilities } from '../adapter'
import type { NormalizedSignal, NormalizedMarket, MarketSnapshot } from '../types'
import { hashTitle, clamp01, truncate, safeIso } from '../utils'

const BASE_URL = process.env.DOME_API_URL ?? 'https://api.dome.market/v1'

export class DomeAdapter implements SourceAdapter {
  readonly providerId = 'dome' as const
  readonly capabilities: AdapterCapabilities = {
    supports_news: false,
    supports_markets: true,
    supports_streaming: false,
    supports_backfill: true,
  }

  private get apiKey(): string | null {
    return process.env.DOME_API_KEY ?? process.env.KALSHI_API_KEY ?? null
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      console.log('[dome-adapter] No DOME_API_KEY or KALSHI_API_KEY configured — stub mode.')
      return false
    }
    try {
      const res = await fetch(`${BASE_URL}/markets?limit=1`, {
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

    const limit = params.max_items ?? 50
    const cursor = (params.cursor as any)?.cursor ?? null

    const qp = new URLSearchParams({ limit: String(limit) })
    if (cursor) qp.set('cursor', cursor)
    if (params.categories?.length) qp.set('category', params.categories[0])

    const res = await fetch(`${BASE_URL}/markets?${qp}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!res.ok) throw new Error(`Dome HTTP ${res.status}`)

    const json = await res.json()
    const markets = json.markets ?? json.data ?? []
    const nextCursor = json.cursor ?? json.next_cursor ?? null

    return {
      items: markets,
      cursor_state: nextCursor ? { cursor: nextCursor } : null,
      has_more: Boolean(nextCursor),
    }
  }

  normalizeSignal(raw: unknown): NormalizedSignal | null {
    const r = raw as Record<string, any>
    if (!r.title) return null

    return {
      provider_id: 'dome',
      external_id: r.id ?? r.ticker ?? null,
      title: r.title,
      summary: truncate(r.subtitle ?? r.description, 1000),
      body_excerpt: null,
      url: r.url ?? null,
      image_url: r.image_url ?? null,
      published_at: safeIso(r.open_date ?? r.created_at),
      language: 'en',
      source_name: r.exchange_slug ?? 'Dome',
      source_domain: 'dome.market',
      authors: [],
      geography: [],
      entity_tags: [],
      category_tags: r.category ? [r.category] : [],
      sentiment: null,
      signal_type: 'prediction_market',
      source_type: 'prediction_market',
      trust_score: 0.60,
      novelty_score: null,
      relevance_score: null,
      market_probability: clamp01(r.yes_price ?? r.last_price),
      market_volume: r.volume ?? null,
      market_id: r.id ?? r.ticker ?? null,
      dedup_hash: hashTitle(r.title),
    }
  }

  normalizeMarket(raw: unknown): NormalizedMarket | null {
    const r = raw as Record<string, any>
    if (!r.title) return null

    const yesPrice = clamp01(r.yes_price ?? r.last_price)
    const outcomes = [
      { name: 'Yes', probability: yesPrice ?? 0.5 },
      { name: 'No', probability: yesPrice != null ? 1 - yesPrice : 0.5 },
    ]

    return {
      provider_id: 'dome',
      external_id: r.id ?? r.ticker,
      title: r.title,
      description: r.subtitle ?? r.description ?? null,
      category: r.category ?? null,
      status: r.status === 'open' ? 'active' : r.status === 'closed' ? 'closed' : 'active',
      url: r.url ?? null,
      image_url: r.image_url ?? null,
      end_date: safeIso(r.close_date ?? r.expiration_date),
      outcomes,
      tags: r.tags ?? [],
      volume: r.volume ?? null,
      liquidity: r.open_interest ?? null,
      last_probability: yesPrice,
    }
  }

  extractSnapshot(_raw: unknown, marketDbId: string): MarketSnapshot | null {
    const r = _raw as Record<string, any>
    const prob = clamp01(r.yes_price ?? r.last_price)
    if (prob == null) return null

    return {
      market_id: marketDbId,
      probability: prob,
      volume_24h: r.volume_24h ?? r.volume ?? null,
      liquidity: r.open_interest ?? null,
      outcomes_detail: null,
    }
  }

  dedupKeys(signal: NormalizedSignal): DedupKeySet {
    return {
      canonical_url: signal.url,
      title_hash: signal.dedup_hash,
      provider_external_id: signal.external_id,
      market_key: signal.market_id ? `dome:${signal.market_id}` : null,
    }
  }
}
