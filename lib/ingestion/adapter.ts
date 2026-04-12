// ============================================================================
// Base adapter interface — every provider implements this contract.
// ============================================================================

import type {
  ProviderId,
  FlowType,
  NormalizedSignal,
  NormalizedMarket,
  MarketSnapshot,
  RawIngestionItem,
  IngestionRunStats,
} from './types'

export interface FetchResult {
  items: unknown[]
  cursor_state: Record<string, unknown> | null
  has_more: boolean
}

export interface AdapterCapabilities {
  supports_news: boolean
  supports_markets: boolean
  supports_streaming: boolean
  supports_backfill: boolean
}

export interface SourceAdapter {
  readonly providerId: ProviderId
  readonly capabilities: AdapterCapabilities

  /**
   * Check provider health / auth validity. Return false if API key is missing
   * or the provider endpoint is unreachable.
   */
  healthCheck(): Promise<boolean>

  /**
   * Fetch a batch of items from the provider.
   * `cursor` is the pagination/offset state from the previous run (null for first run).
   * `params` contains flow-specific query params (keywords, topics, etc.).
   */
  fetch(params: FetchParams): Promise<FetchResult>

  /**
   * Normalize a single raw provider payload into the canonical NormalizedSignal.
   */
  normalizeSignal(raw: unknown): NormalizedSignal | null

  /**
   * For prediction market adapters: normalize raw payload into canonical market.
   */
  normalizeMarket?(raw: unknown): NormalizedMarket | null

  /**
   * For prediction market adapters: extract a snapshot from raw data.
   */
  extractSnapshot?(raw: unknown, marketDbId: string): MarketSnapshot | null

  /**
   * Return the dedup key(s) for a normalized signal.
   * Used by the dedup engine to find matches.
   */
  dedupKeys(signal: NormalizedSignal): DedupKeySet
}

export interface FetchParams {
  flow_type: FlowType
  cursor: Record<string, unknown> | null
  keywords?: string[]
  categories?: string[]
  languages?: string[]
  countries?: string[]
  max_items?: number
  since?: string
}

export interface DedupKeySet {
  canonical_url: string | null
  title_hash: string | null
  provider_external_id: string | null
  market_key: string | null
}
