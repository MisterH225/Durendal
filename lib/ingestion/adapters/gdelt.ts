// ============================================================================
// GDELT adapter — global event discovery and monitoring
// Auth: none (public API)
// Endpoints: DOC API v2 (https://api.gdeltproject.org/api/v2/doc/doc)
// Sync: polling (every 30–60 min)
// Rate limit: ~120 req/min (public, but be respectful)
// Dedup: GDELT URL hash + title hash
// ============================================================================

import type { SourceAdapter, FetchParams, FetchResult, DedupKeySet, AdapterCapabilities } from '../adapter'
import type { NormalizedSignal } from '../types'
import { hashTitle, canonicalizeUrl, extractDomain, safeIso, truncate } from '../utils'

const DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc'

export class GdeltAdapter implements SourceAdapter {
  readonly providerId = 'gdelt' as const
  readonly capabilities: AdapterCapabilities = {
    supports_news: true,
    supports_markets: false,
    supports_streaming: false,
    supports_backfill: true,
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${DOC_API}?query=test&mode=artlist&maxrecords=1&format=json`)
      return res.ok
    } catch {
      return false
    }
  }

  async fetch(params: FetchParams): Promise<FetchResult> {
    const query = params.keywords?.join(' ') || 'geopolitics OR economy OR conflict'
    const maxRecords = params.max_items ?? 75
    const timespan = params.since ? undefined : '60min'

    const qp = new URLSearchParams({
      query,
      mode: 'artlist',
      maxrecords: String(maxRecords),
      format: 'json',
      sort: 'datedesc',
    })

    if (timespan) qp.set('timespan', timespan)
    if (params.languages?.length) qp.set('sourcelang', params.languages[0])
    if (params.countries?.length) qp.set('sourcecountry', params.countries[0])

    const res = await fetch(`${DOC_API}?${qp}`)
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)

    const json = await res.json()
    const articles = json.articles ?? []

    return {
      items: articles,
      cursor_state: null,
      has_more: false,
    }
  }

  normalizeSignal(raw: unknown): NormalizedSignal | null {
    const r = raw as Record<string, any>
    if (!r.title && !r.url) return null

    const title = r.title ?? r.url ?? 'Untitled GDELT article'
    const url = r.url ?? null
    const domain = r.domain ?? (url ? extractDomain(url) : null)

    const toneParts = r.tone ? String(r.tone).split(',') : []
    const avgTone = toneParts.length > 0 ? parseFloat(toneParts[0]) : NaN
    const sentiment = isNaN(avgTone) ? null : Math.max(-1, Math.min(1, avgTone / 10))

    return {
      provider_id: 'gdelt',
      external_id: url ? canonicalizeUrl(url) : null,
      title: truncate(title, 500) ?? title,
      summary: truncate(r.seendate ? `GDELT event detected ${r.seendate}` : null, 500),
      body_excerpt: null,
      url,
      image_url: r.socialimage ?? null,
      published_at: safeIso(r.seendate),
      language: r.language ?? r.sourcelang ?? null,
      source_name: r.domain ?? null,
      source_domain: domain,
      authors: [],
      geography: r.sourcecountry ? [r.sourcecountry] : [],
      entity_tags: [],
      category_tags: r.theme ? String(r.theme).split(';').slice(0, 10) : [],
      sentiment,
      signal_type: 'event_detection',
      source_type: 'event_detection',
      trust_score: 0.45,
      novelty_score: null,
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
