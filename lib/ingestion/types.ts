// ============================================================================
// Canonical types for the multi-source ingestion layer.
// Every provider adapter normalizes into these shapes.
// ============================================================================

export type ProviderId = 'newsdata' | 'finlight' | 'gdelt' | 'polymarket' | 'dome' | 'perplexity'

export type ProviderType = 'news' | 'financial_news' | 'event_monitor' | 'prediction_market' | 'unified_market' | 'ai_search'

export type FlowType = 'news_general' | 'news_financial' | 'event_discovery' | 'market_snapshot' | 'backfill'

export type SourceType = 'article' | 'wire' | 'blog' | 'social' | 'government' | 'market_data' | 'event_detection' | 'prediction_market'

export type SignalEventLinkStatus = 'pending' | 'linked' | 'unlinked' | 'rejected'

export type RunStatus = 'running' | 'completed' | 'partial' | 'failed'

// ── Provider config ──────────────────────────────────────────────────────────

export interface ExternalSourceProvider {
  id: ProviderId
  display_name: string
  provider_type: ProviderType
  base_url: string | null
  auth_strategy: 'api_key' | 'none' | 'oauth' | 'custom'
  is_enabled: boolean
  default_trust: number
  rate_limit_rpm: number | null
  rate_limit_daily: number | null
  config: Record<string, unknown>
}

// ── Raw ingestion ────────────────────────────────────────────────────────────

export interface RawIngestionItem {
  id?: string
  run_id: string
  provider_id: ProviderId
  external_id: string | null
  raw_payload: unknown
  fetched_at?: string
  normalized?: boolean
}

// ── Normalized signal (canonical schema) ─────────────────────────────────────

export interface NormalizedSignal {
  provider_id: ProviderId
  external_id: string | null
  raw_item_id?: string

  title: string
  summary: string | null
  body_excerpt: string | null
  url: string | null
  image_url: string | null

  published_at: string | null
  ingested_at?: string

  language: string | null
  source_name: string | null
  source_domain: string | null
  authors: string[]

  geography: string[]
  entity_tags: string[]
  category_tags: string[]
  sentiment: number | null
  signal_type: string
  source_type: SourceType

  trust_score: number
  novelty_score: number | null
  relevance_score: number | null

  market_probability: number | null
  market_volume: number | null
  market_id: string | null

  event_link_status?: SignalEventLinkStatus
  dedup_hash: string | null
}

// ── External market (prediction market canonical) ────────────────────────────

export interface NormalizedMarket {
  provider_id: ProviderId
  external_id: string
  title: string
  description: string | null
  category: string | null
  status: 'active' | 'closed' | 'resolved' | 'archived'
  url: string | null
  image_url: string | null
  end_date: string | null
  outcomes: MarketOutcome[]
  tags: string[]
  volume: number | null
  liquidity: number | null
  last_probability: number | null
}

export interface MarketOutcome {
  name: string
  probability: number
  price?: number
}

export interface MarketSnapshot {
  market_id: string
  probability: number
  volume_24h: number | null
  liquidity: number | null
  outcomes_detail: MarketOutcome[] | null
  captured_at?: string
}

// ── Event link candidate ─────────────────────────────────────────────────────

export interface EventLinkCandidate {
  signal_id: string
  target_type: 'forecast_event' | 'intel_event' | 'forecast_question'
  target_id: string
  confidence: number
  match_reason: string | null
}

// ── Dedup group ──────────────────────────────────────────────────────────────

export interface DedupMatch {
  type: 'exact_url' | 'title_hash' | 'near_duplicate' | 'market_identity'
  existing_signal_id: string
  existing_group_id: string | null
  confidence: number
}

// ── Source trust ─────────────────────────────────────────────────────────────

export interface SourceTrustProfile {
  provider_id: ProviderId
  source_domain: string
  source_name: string | null
  trust_score: number
  bias_label: string | null
  language: string | null
  geography_focus: string[]
  category_focus: string[]
}

// ── Ingestion run ────────────────────────────────────────────────────────────

export interface IngestionRunStats {
  items_fetched: number
  items_normalized: number
  items_deduped: number
  items_persisted: number
  errors: Array<{ code: string; message: string; item_id?: string }>
}

// ── Ingestion events ─────────────────────────────────────────────────────────

export type IngestionEventName =
  | 'ingestion.run.started'
  | 'ingestion.run.completed'
  | 'ingestion.item.fetched'
  | 'signal.normalized'
  | 'signal.dedupe.matched'
  | 'signal.persisted'
  | 'signal.ready_for_enrichment'
  | 'market.snapshot.updated'
  | 'market.move.detected'
  | 'event.link.candidate.created'

export interface IngestionEvent {
  name: IngestionEventName
  provider_id: ProviderId
  correlation_id: string
  payload: Record<string, unknown>
  occurred_at: string
}
