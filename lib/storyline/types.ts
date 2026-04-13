// ============================================================================
// Storyline Engine — Core Domain Types
// Replaces and extends lib/graph/types.ts for the storyline feature.
// ============================================================================

// ── Input modes ──────────────────────────────────────────────────────────────

export type StorylineInputType = 'url' | 'article_id' | 'keyword' | 'event_id' | 'storyline_refresh'

export interface StorylineInput {
  type: StorylineInputType
  value: string
  userId?: string
  options?: StorylineBuildOptions
}

export interface StorylineBuildOptions {
  maxPastEvents?: number
  maxFutureOutcomes?: number
  maxCorollaryBranches?: number
  timeHorizonDays?: number
  regions?: string[]
  sectors?: string[]
  language?: string
}

export const DEFAULT_BUILD_OPTIONS: Required<StorylineBuildOptions> = {
  maxPastEvents: 12,
  maxFutureOutcomes: 5,
  maxCorollaryBranches: 4,
  timeHorizonDays: 365 * 5,
  regions: [],
  sectors: [],
  language: 'fr',
}

// ── Anchor ───────────────────────────────────────────────────────────────────

export interface StorylineAnchor {
  title: string
  summary: string
  url?: string
  publishedAt?: string
  entities: string[]
  regions: string[]
  sectors: string[]
  keywords: string[]
}

// ── Normalized Event ─────────────────────────────────────────────────────────

export interface NormalizedEvent {
  id: string
  title: string
  summary?: string
  eventType?: string
  who?: string[]
  what?: string
  happenedAt?: string
  whereGeo?: string[]
  why?: string
  sectors?: string[]
  tags?: string[]
  confidence: number
  importance: number
  forecastEventId?: string
  intelEventId?: string
  dedupHash?: string
  sourceOrigin: 'platform' | 'external_retrieval' | 'ai_inferred'
}

// ── Evidence ─────────────────────────────────────────────────────────────────

export interface SourceEvidence {
  url?: string
  title?: string
  sourceName?: string
  excerpt?: string
  publishedAt?: string
  trustScore: number
  platformType?: 'signal_feed' | 'external_signal' | 'veille_signal' | 'forecast_question'
  platformId?: string
}

// ── Relations ────────────────────────────────────────────────────────────────

export type EventRelationType =
  | 'predecessor'
  | 'successor'
  | 'causes'
  | 'caused_by'
  | 'corollary'
  | 'parallel'
  | 'escalation'
  | 'de_escalation'
  | 'response_to'
  | 'spillover'

export interface EventRelation {
  sourceEventId: string
  targetEventId: string
  relationType: EventRelationType
  confidence: number
  explanation?: string
  evidenceBasis?: string[]
  timeDeltaDays?: number
}

// ── Storyline Card ───────────────────────────────────────────────────────────

export type StorylineCardType = 'anchor' | 'predecessor' | 'successor' | 'corollary' | 'outcome' | 'context'

export interface StorylineCard {
  id: string
  storylineId?: string
  eventId?: string
  cardType: StorylineCardType
  trunkPosition?: number
  branchId?: string
  label: string
  summary?: string
  happenedAt?: string
  probability?: number
  probabilitySource?: 'ai_estimate' | 'community' | 'blended' | 'platform'
  outcomeStatus?: 'pending' | 'confirmed' | 'failed' | 'partially_confirmed'
  importance: number
  confidence: number
  evidence: SourceEvidence[]
}

// ── Storyline Edge ───────────────────────────────────────────────────────────

export type StorylineEdgeType =
  | 'leads_to'
  | 'causes'
  | 'triggers'
  | 'corollary_of'
  | 'may_lead_to'
  | 'response_to'
  | 'parallel_to'

export interface StorylineEdge {
  id: string
  storylineId?: string
  sourceCardId: string
  targetCardId: string
  edgeType: StorylineEdgeType
  confidence: number
  label?: string
}

// ── Full Storyline ───────────────────────────────────────────────────────────

export interface Storyline {
  id: string
  userId?: string
  title: string
  description?: string
  anchorEventId?: string
  inputType: StorylineInputType
  inputValue: string
  status: 'active' | 'archived' | 'deleted'
  region?: string
  sectors?: string[]
  tags?: string[]
  version: number
  lastRefreshed?: string
  cards: StorylineCard[]
  edges: StorylineEdge[]
  createdAt: string
  updatedAt: string
}

// ── Retrieval types ──────────────────────────────────────────────────────────

export type RetrievalTimeWindow = 'immediate' | 'recent' | 'medium' | 'long' | 'archival'

export interface TimeWindowConfig {
  window: RetrievalTimeWindow
  label: string
  daysBack: number
  daysBackEnd: number
  maxResults: number
  minExplanatoryRelevance: number
}

export const TIME_WINDOW_CONFIGS: TimeWindowConfig[] = [
  { window: 'immediate',  label: '0-7 jours',     daysBack: 0,     daysBackEnd: 7,     maxResults: 8,  minExplanatoryRelevance: 0.3 },
  { window: 'recent',     label: '1-4 semaines',   daysBack: 7,     daysBackEnd: 30,    maxResults: 6,  minExplanatoryRelevance: 0.4 },
  { window: 'medium',     label: '1-6 mois',       daysBack: 30,    daysBackEnd: 180,   maxResults: 5,  minExplanatoryRelevance: 0.5 },
  { window: 'long',       label: '6 mois - 2 ans', daysBack: 180,   daysBackEnd: 730,   maxResults: 4,  minExplanatoryRelevance: 0.6 },
  { window: 'archival',   label: '2+ ans',         daysBack: 730,   daysBackEnd: 3650,  maxResults: 3,  minExplanatoryRelevance: 0.7 },
]

export interface RetrievalCandidate {
  title: string
  url?: string
  snippet: string
  publishedAt?: string
  source: 'platform_signal' | 'platform_event' | 'platform_question' | 'external_signal' | 'perplexity' | 'gemini_grounding'
  sourceId?: string
  trustScore: number
  entityOverlap: string[]
  regionOverlap: string[]
  sectorOverlap: string[]
}

export interface RankedCandidate extends RetrievalCandidate {
  relevanceScore: number
  explanatoryValue: number
  causalPrecursorScore: number
  temporalPosition: 'past' | 'concurrent' | 'future' | 'unknown'
  timeWindow?: RetrievalTimeWindow
  isDuplicate: boolean
}

// ── Build Pipeline Result ────────────────────────────────────────────────────

export interface StorylineBuildResult {
  storyline: Storyline
  stats: {
    candidatesRetrieved: number
    candidatesRanked: number
    eventsNormalized: number
    relationsDetected: number
    outcomesGenerated: number
    timeWindowBreakdown: Record<RetrievalTimeWindow, number>
  }
}

// ── Backward compatibility: re-export graph types for the UI layer ───────────
// The existing graph UI components import from lib/graph/types.
// We keep that working by re-exporting compatible types.

export type { IntelligenceGraphNode, IntelligenceGraphEdge, GraphSearchResult, GraphFilters } from '@/lib/graph/types'
