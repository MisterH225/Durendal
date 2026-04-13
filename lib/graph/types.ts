// ============================================================================
// Intelligence Graph + Storyline Engine — Domain types
// ============================================================================

// ── Graph node/edge types (kept for backward compat) ─────────────────────────

export type GraphNodeType =
  | 'article'
  | 'signal'
  | 'event'
  | 'entity'
  | 'question'
  | 'region'
  | 'sector'
  | 'document'
  | 'market_signal'
  | 'source'
  | 'outcome'
  | 'context'

export type GraphEdgeType =
  | 'mentions'
  | 'linked_to'
  | 'updates'
  | 'impacts'
  | 'affects'
  | 'supports'
  | 'contradicts'
  | 'related_to'
  | 'raises_probability_of'
  | 'lowers_probability_of'
  | 'belongs_to_region'
  | 'belongs_to_sector'
  | 'causes'
  | 'triggers'
  | 'precedes'
  | 'parallel'
  | 'corollary'
  | 'leads_to'
  | 'raises_probability'
  | 'lowers_probability'

export interface IntelligenceGraphNode {
  id: string
  type: GraphNodeType
  label: string
  subtitle?: string
  summary?: string
  score?: number
  importance?: number
  createdAt?: string
  updatedAt?: string
  regionTags?: string[]
  sectorTags?: string[]
  url?: string
  probability?: number
  metadata?: Record<string, unknown>
}

export interface IntelligenceGraphEdge {
  id: string
  source: string
  target: string
  type: GraphEdgeType
  weight?: number
  confidence?: number
  explanation?: string
  provenance?: string[]
  createdAt?: string
}

export interface GraphSearchResult {
  query: string
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
  anchorNodeIds: string[]
  groupedMatches: {
    articles: string[]
    events: string[]
    entities: string[]
    questions: string[]
    signals: string[]
    documents: string[]
  }
  totals: {
    articles: number
    events: number
    entities: number
    questions: number
    signals: number
    documents: number
  }
}

export interface GraphFilters {
  nodeTypes: GraphNodeType[]
  edgeTypes: GraphEdgeType[]
  dateRange: { from: string | null; to: string | null }
  regions: string[]
  sectors: string[]
  minConfidence: number
}

export const DEFAULT_FILTERS: GraphFilters = {
  nodeTypes: ['article', 'signal', 'event', 'entity', 'question', 'region', 'sector', 'document', 'market_signal', 'source', 'outcome', 'context'],
  edgeTypes: ['mentions', 'linked_to', 'updates', 'impacts', 'affects', 'supports', 'contradicts', 'related_to', 'raises_probability_of', 'lowers_probability_of', 'belongs_to_region', 'belongs_to_sector', 'causes', 'triggers', 'precedes', 'parallel', 'corollary', 'leads_to', 'raises_probability', 'lowers_probability'],
  dateRange: { from: null, to: null },
  regions: [],
  sectors: [],
  minConfidence: 0,
}

// ── Storyline Engine types ───────────────────────────────────────────────────

export type TemporalPosition =
  | 'deep_past'
  | 'past'
  | 'recent'
  | 'anchor'
  | 'concurrent'
  | 'consequence'
  | 'future'

export type CausalRole =
  | 'root_cause'
  | 'precursor'
  | 'trigger'
  | 'parallel'
  | 'effect'
  | 'corollary'
  | 'reaction'

export type StorylineCardType =
  | 'event'
  | 'article'
  | 'signal'
  | 'entity'
  | 'outcome'
  | 'context'

export type StorylineEdgeType =
  | 'causes'
  | 'triggers'
  | 'precedes'
  | 'parallel'
  | 'corollary'
  | 'leads_to'
  | 'contradicts'
  | 'supports'
  | 'raises_probability'
  | 'lowers_probability'

export interface StorylineCard {
  id: string
  cardType: StorylineCardType
  temporalPosition: TemporalPosition
  title: string
  summary?: string
  date?: string
  confidence?: number
  probability?: number
  probabilitySource?: 'ai_estimate' | 'crowd' | 'blended' | 'market'
  entities: string[]
  regionTags: string[]
  sectorTags: string[]
  sourceUrls: string[]
  platformRefType?: string
  platformRefId?: string
  importance: number
  sortOrder: number
  metadata?: Record<string, unknown>
}

export interface StorylineEdge {
  id: string
  sourceCardId: string
  targetCardId: string
  relationType: StorylineEdgeType
  confidence?: number
  explanation?: string
  isTrunk: boolean
}

export interface StorylineResult {
  id?: string
  anchorType: 'keyword' | 'article' | 'event' | 'url'
  anchorRef: string
  anchorTitle: string
  anchorSummary?: string
  cards: StorylineCard[]
  edges: StorylineEdge[]
  narrative?: string
  status: 'building' | 'ready' | 'stale'
}

export interface StorylineSSEEvent {
  phase: 'internal' | 'external' | 'analysis' | 'outcomes' | 'complete' | 'error'
  cards?: StorylineCard[]
  edges?: StorylineEdge[]
  narrative?: string
  storyline?: StorylineResult
  error?: string
}

export interface CandidateItem {
  title: string
  summary: string
  url?: string
  date?: string
  sourceType: 'internal' | 'perplexity' | 'gemini'
  temporalWindow?: string
  entities?: string[]
  regionTags?: string[]
  sectorTags?: string[]
  relevanceScore?: number
  trustScore?: number
  platformRefType?: string
  platformRefId?: string
}

export interface StorylineAnalysis {
  anchor: { title: string; summary: string }
  timeline: Array<{
    candidateRef: string
    temporalPosition: TemporalPosition
    causalRole: CausalRole
    causalConfidence: number
    explanation: string
    entities: string[]
  }>
  outcomes: Array<{
    title: string
    probability: number
    reasoning: string
    timeHorizon: string
    supportingEvidence: string[]
  }>
  narrative: string
}

// ── Visual config per node type ─────────────────────────────────────────────

export const NODE_TYPE_CONFIG: Record<GraphNodeType, {
  color: string
  bgClass: string
  borderClass: string
  textClass: string
  icon: string
  label: string
  size: 'lg' | 'md' | 'sm'
}> = {
  event:         { color: '#ef4444', bgClass: 'bg-red-500/15',     borderClass: 'border-red-500/40',     textClass: 'text-red-400',     icon: '⚡', label: 'Événement',     size: 'lg' },
  question:      { color: '#8b5cf6', bgClass: 'bg-violet-500/15',  borderClass: 'border-violet-500/40',  textClass: 'text-violet-400',  icon: '❓', label: 'Question',      size: 'lg' },
  entity:        { color: '#3b82f6', bgClass: 'bg-blue-500/15',    borderClass: 'border-blue-500/40',    textClass: 'text-blue-400',    icon: '🏢', label: 'Entité',        size: 'md' },
  article:       { color: '#f59e0b', bgClass: 'bg-amber-500/15',   borderClass: 'border-amber-500/40',   textClass: 'text-amber-400',   icon: '📄', label: 'Article',       size: 'sm' },
  signal:        { color: '#f97316', bgClass: 'bg-orange-500/15',  borderClass: 'border-orange-500/40',  textClass: 'text-orange-400',  icon: '📡', label: 'Signal',        size: 'sm' },
  region:        { color: '#10b981', bgClass: 'bg-emerald-500/15', borderClass: 'border-emerald-500/40', textClass: 'text-emerald-400', icon: '🌍', label: 'Région',        size: 'md' },
  sector:        { color: '#06b6d4', bgClass: 'bg-cyan-500/15',    borderClass: 'border-cyan-500/40',    textClass: 'text-cyan-400',    icon: '📊', label: 'Secteur',       size: 'md' },
  document:      { color: '#64748b', bgClass: 'bg-slate-500/15',   borderClass: 'border-slate-500/40',   textClass: 'text-slate-400',   icon: '📑', label: 'Document',      size: 'sm' },
  market_signal: { color: '#22c55e', bgClass: 'bg-green-500/15',   borderClass: 'border-green-500/40',   textClass: 'text-green-400',   icon: '📈', label: 'Marché',        size: 'sm' },
  source:        { color: '#a855f7', bgClass: 'bg-purple-500/15',  borderClass: 'border-purple-500/40',  textClass: 'text-purple-400',  icon: '🔗', label: 'Source',        size: 'sm' },
  outcome:       { color: '#14b8a6', bgClass: 'bg-teal-500/15',   borderClass: 'border-teal-500/40',   textClass: 'text-teal-400',    icon: '🎯', label: 'Projection',    size: 'lg' },
  context:       { color: '#78716c', bgClass: 'bg-stone-500/15',  borderClass: 'border-stone-500/40',  textClass: 'text-stone-400',   icon: '📋', label: 'Contexte',      size: 'md' },
}

export const EDGE_TYPE_CONFIG: Record<GraphEdgeType, {
  color: string
  dash?: boolean
  label: string
}> = {
  mentions:                 { color: '#6b7280', label: 'Mentionne' },
  linked_to:                { color: '#6b7280', label: 'Lié à' },
  updates:                  { color: '#3b82f6', label: 'Met à jour' },
  impacts:                  { color: '#ef4444', label: 'Impacte' },
  affects:                  { color: '#f97316', label: 'Affecte' },
  supports:                 { color: '#22c55e', label: 'Soutient' },
  contradicts:              { color: '#ef4444', dash: true, label: 'Contredit' },
  related_to:               { color: '#8b5cf6', dash: true, label: 'Relié à' },
  raises_probability_of:    { color: '#22c55e', label: '↑ Probabilité' },
  lowers_probability_of:    { color: '#ef4444', label: '↓ Probabilité' },
  belongs_to_region:        { color: '#10b981', dash: true, label: 'Région' },
  belongs_to_sector:        { color: '#06b6d4', dash: true, label: 'Secteur' },
  causes:                   { color: '#dc2626', label: 'Cause' },
  triggers:                 { color: '#ea580c', label: 'Déclenche' },
  precedes:                 { color: '#9ca3af', dash: true, label: 'Précède' },
  parallel:                 { color: '#6366f1', dash: true, label: 'Parallèle' },
  corollary:                { color: '#8b5cf6', dash: true, label: 'Corollaire' },
  leads_to:                 { color: '#f59e0b', label: 'Mène à' },
  raises_probability:       { color: '#22c55e', label: '↑ Probabilité' },
  lowers_probability:       { color: '#ef4444', label: '↓ Probabilité' },
}
