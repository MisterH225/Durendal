// ============================================================================
// Polymarket adapter — prediction market data via Gamma API
// Auth: none (public)
// Endpoints: https://gamma-api.polymarket.com/events, /markets
// Sync: polling (every 10–15 min for active markets)
// Rate limit: ~60 req/min
// Dedup: market condition_id + event slug
// ============================================================================

import type { SourceAdapter, FetchParams, FetchResult, DedupKeySet, AdapterCapabilities } from '../adapter'
import type { NormalizedSignal, NormalizedMarket, MarketSnapshot, MarketOutcome } from '../types'
import { hashTitle, truncate, safeIso, clamp01 } from '../utils'

const GAMMA_API = 'https://gamma-api.polymarket.com'

export class PolymarketAdapter implements SourceAdapter {
  readonly providerId = 'polymarket' as const
  readonly capabilities: AdapterCapabilities = {
    supports_news: false,
    supports_markets: true,
    supports_streaming: false,
    supports_backfill: true,
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${GAMMA_API}/events?limit=1&active=true`)
      return res.ok
    } catch {
      return false
    }
  }

  async fetch(params: FetchParams): Promise<FetchResult> {
    const limit = params.max_items ?? 50
    const offset = (params.cursor as any)?.offset ?? 0

    const qp = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      active: 'true',
      order: 'volume24hr',
      ascending: 'false',
    })

    if (params.keywords?.length) qp.set('tag', params.keywords[0])

    const res = await fetch(`${GAMMA_API}/events?${qp}`)
    if (!res.ok) throw new Error(`Polymarket HTTP ${res.status}`)

    const events = await res.json()
    const arr = Array.isArray(events) ? events : []

    return {
      items: arr,
      cursor_state: arr.length >= limit ? { offset: offset + arr.length } : null,
      has_more: arr.length >= limit,
    }
  }

  normalizeSignal(raw: unknown): NormalizedSignal | null {
    const r = raw as Record<string, any>
    if (!r.title) return null

    const markets = r.markets ?? []
    const primaryMarket = markets[0] as Record<string, any> | undefined
    const prob = primaryMarket?.outcomePrices
      ? (() => {
          try {
            const prices = JSON.parse(primaryMarket.outcomePrices)
            return Array.isArray(prices) ? parseFloat(prices[0]) : null
          } catch { return null }
        })()
      : null

    return {
      provider_id: 'polymarket',
      external_id: r.id ?? r.slug ?? null,
      title: r.title,
      summary: truncate(r.description, 1000),
      body_excerpt: null,
      url: r.slug ? `https://polymarket.com/event/${r.slug}` : null,
      image_url: r.image ?? null,
      published_at: safeIso(r.startDate ?? r.createdAt),
      language: 'en',
      source_name: 'Polymarket',
      source_domain: 'polymarket.com',
      authors: [],
      geography: [],
      entity_tags: r.tags?.map((t: any) => t.label ?? t) ?? [],
      category_tags: r.category ? [r.category] : [],
      sentiment: null,
      signal_type: 'prediction_market',
      source_type: 'prediction_market',
      trust_score: 0.70,
      novelty_score: null,
      relevance_score: null,
      market_probability: clamp01(prob),
      market_volume: primaryMarket?.volume ?? r.volume ?? null,
      market_id: primaryMarket?.conditionId ?? r.id ?? null,
      dedup_hash: hashTitle(r.title),
    }
  }

  normalizeMarket(raw: unknown): NormalizedMarket | null {
    const r = raw as Record<string, any>
    if (!r.title) return null

    const markets = r.markets ?? []
    const outcomes: MarketOutcome[] = markets.map((m: any) => {
      let prices: number[] = []
      try { prices = JSON.parse(m.outcomePrices ?? '[]') } catch {}
      return {
        name: m.question ?? m.groupItemTitle ?? 'Yes',
        probability: prices[0] ?? 0,
        price: prices[0] ?? undefined,
      }
    })

    const primaryProb = outcomes[0]?.probability ?? null

    return {
      provider_id: 'polymarket',
      external_id: r.id ?? r.slug,
      title: r.title,
      description: r.description ?? null,
      category: r.category ?? null,
      status: r.closed ? 'closed' : r.active !== false ? 'active' : 'archived',
      url: r.slug ? `https://polymarket.com/event/${r.slug}` : null,
      image_url: r.image ?? null,
      end_date: safeIso(r.endDate),
      outcomes,
      tags: r.tags?.map((t: any) => t.label ?? t) ?? [],
      volume: r.volume ?? null,
      liquidity: r.liquidity ?? null,
      last_probability: clamp01(primaryProb),
    }
  }

  extractSnapshot(_raw: unknown, marketDbId: string): MarketSnapshot | null {
    const r = _raw as Record<string, any>
    const markets = r.markets ?? []
    const primary = markets[0] as Record<string, any> | undefined
    if (!primary) return null

    let prob = 0
    try {
      const prices = JSON.parse(primary.outcomePrices ?? '[]')
      prob = parseFloat(prices[0]) || 0
    } catch {}

    return {
      market_id: marketDbId,
      probability: Math.max(0, Math.min(1, prob)),
      volume_24h: primary.volume24hr ?? null,
      liquidity: primary.liquidity ?? null,
      outcomes_detail: null,
    }
  }

  dedupKeys(signal: NormalizedSignal): DedupKeySet {
    return {
      canonical_url: signal.url ? signal.url : null,
      title_hash: signal.dedup_hash,
      provider_external_id: signal.external_id,
      market_key: signal.market_id ? `polymarket:${signal.market_id}` : null,
    }
  }
}
