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
  // temporal
  | 'before'
  | 'after'
  | 'concurrent_with'
  | 'immediate_precursor'
  | 'long_term_precursor'
  // causal
  | 'causes'
  | 'contributes_to'
  | 'enables'
  | 'triggers'
  | 'prevents'
  // contextual
  | 'background_context'
  | 'same_storyline'
  // corollary
  | 'response_to'
  | 'spillover_from'
  | 'retaliation_to'
  | 'market_reaction_to'
  | 'policy_reaction_to'
  | 'parallel_development'
  // outcome
  | 'may_lead_to'
  | 'raises_probability'
  | 'lowers_probability'
  | 'outcome_of'
  // legacy compat
  | 'precedes'
  | 'parallel'
  | 'corollary'
  | 'leads_to'

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
  edgeTypes: ['mentions', 'linked_to', 'updates', 'impacts', 'affects', 'supports', 'contradicts', 'related_to', 'raises_probability_of', 'lowers_probability_of', 'belongs_to_region', 'belongs_to_sector', 'before', 'after', 'concurrent_with', 'immediate_precursor', 'long_term_precursor', 'causes', 'contributes_to', 'enables', 'triggers', 'prevents', 'background_context', 'same_storyline', 'response_to', 'spillover_from', 'retaliation_to', 'market_reaction_to', 'policy_reaction_to', 'parallel_development', 'may_lead_to', 'raises_probability', 'lowers_probability', 'outcome_of'],
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

export type RelationCategory =
  | 'temporal'
  | 'causal'
  | 'contextual'
  | 'corollary'
  | 'outcome'

export type TemporalSubtype =
  | 'before'
  | 'after'
  | 'concurrent_with'
  | 'immediate_precursor'
  | 'long_term_precursor'

export type CausalSubtype =
  | 'causes'
  | 'contributes_to'
  | 'enables'
  | 'triggers'
  | 'prevents'

export type ContextualSubtype =
  | 'background_context'
  | 'related_to'
  | 'same_storyline'

export type CorollarySubtype =
  | 'response_to'
  | 'spillover_from'
  | 'retaliation_to'
  | 'market_reaction_to'
  | 'policy_reaction_to'
  | 'parallel_development'

export type OutcomeSubtype =
  | 'may_lead_to'
  | 'raises_probability_of'
  | 'lowers_probability_of'
  | 'outcome_of'

export type RelationSubtype =
  | TemporalSubtype
  | CausalSubtype
  | ContextualSubtype
  | CorollarySubtype
  | OutcomeSubtype

export type StorylineCardType =
  | 'event'
  | 'article'
  | 'signal'
  | 'entity'
  | 'outcome'
  | 'context'

export interface SourceArticle {
  title: string
  url: string
}

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
  sourceArticles?: SourceArticle[]
  platformRefType?: string
  platformRefId?: string
  importance: number
  sortOrder: number
  isTrunk?: boolean
  isCorollary?: boolean
  attachedToCardId?: string
  supportingEvidence?: string[]
  contradictingEvidence?: string[]
  outcomeStatus?: 'projected' | 'verified' | 'contradicted' | 'expired'
  metadata?: Record<string, unknown>
}

export interface StorylineEdge {
  id: string
  sourceCardId: string
  targetCardId: string
  relationCategory: RelationCategory
  relationSubtype: RelationSubtype
  confidence?: number
  explanation?: string
  causalEvidence?: string
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

export interface StorylineAnalysisEntry {
  candidateRef: string
  /** EventCluster ID — set by v2 pipeline, used for cluster-based assembly */
  clusterId?: string
  temporalRelation: TemporalSubtype
  relationCategory: 'causal' | 'contextual' | 'corollary'
  relationSubtype: string
  causalConfidence: number
  causalEvidence: string
  explanation: string
  entities: string[]
  chainPredecessorRef?: string
  sourceArticles?: SourceArticle[]
  isCorollary?: boolean
  attachedToRef?: string
}

export interface StorylineOutcome {
  title: string
  probability: number
  reasoning: string
  timeHorizon: string
  supportingEvidence: string[]
  contradictingEvidence: string[]
  probabilitySource: 'ai_estimate' | 'crowd' | 'blended' | 'market'
}

export interface StorylineAnalysis {
  anchor: { title: string; summary: string }
  timeline: StorylineAnalysisEntry[]
  outcomes: StorylineOutcome[]
  narrative: string
}

// ── Counterfactual Check types ──────────────────────────────────────────────

export type CounterfactualRelationLabel =
  | 'preceded_by'
  | 'background_context'
  | 'long_term_precursor'
  | 'contributes_to'
  | 'likely_cause'
  | 'triggers'
  | 'response_to'
  | 'spillover_from'

export interface CounterfactualScores {
  temporalSupport: number
  mechanismPlausibility: number
  counterfactualDependence: number
  evidenceSupport: number
  alternativeCausePenalty: number
  responsePatternScore: number
  spilloverPatternScore: number
  composite: number
}

export interface CounterfactualExplanation {
  bullets: string[]
  downgrades: string[]
  finalRationale: string
}

export interface CompetingCauseCandidate {
  title: string
  entities: string[]
  causalConfidence: number
  causalEvidence: string
  temporalRelation: TemporalSubtype
  mechanismPlausibility: number
}

export interface CounterfactualCheckInput {
  anchorTitle: string
  anchorSummary: string
  anchorDate: string
  anchorEntities: string[]
  candidateTitle: string
  candidateSummary: string
  candidateDate?: string
  candidateEntities: string[]
  candidateRegions: string[]
  candidateSectors: string[]
  temporalRelation: TemporalSubtype
  llmRelationCategory: 'causal' | 'contextual' | 'corollary'
  llmRelationSubtype: string
  llmCausalConfidence: number
  llmCausalEvidence: string
  llmExplanation: string
  competingCauses: CompetingCauseCandidate[]
}

export interface CounterfactualCheckResult {
  finalLabel: CounterfactualRelationLabel
  scores: CounterfactualScores
  confidence: number
  explanation: CounterfactualExplanation
  wasDowngraded: boolean
  originalLabel: string
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

export const EDGE_TYPE_CONFIG: Record<string, {
  color: string
  dash?: boolean
  label: string
  strokeWidth?: number
}> = {
  // ── Legacy graph edges ──
  mentions:                 { color: '#6b7280', label: 'Mentionne' },
  linked_to:                { color: '#6b7280', label: 'Lié à' },
  updates:                  { color: '#3b82f6', label: 'Met à jour' },
  impacts:                  { color: '#ef4444', label: 'Impacte' },
  affects:                  { color: '#f97316', label: 'Affecte' },
  supports:                 { color: '#22c55e', label: 'Soutient' },
  contradicts:              { color: '#ef4444', dash: true, label: 'Contredit' },
  raises_probability_of:    { color: '#22c55e', label: '↑ Probabilité' },
  lowers_probability_of:    { color: '#ef4444', label: '↓ Probabilité' },
  belongs_to_region:        { color: '#10b981', dash: true, label: 'Région' },
  belongs_to_sector:        { color: '#06b6d4', dash: true, label: 'Secteur' },

  // ── Temporal (dashed gray, thin) ──
  before:                   { color: '#9ca3af', dash: true, label: 'Précédé par', strokeWidth: 1 },
  after:                    { color: '#9ca3af', dash: true, label: 'Suivi par', strokeWidth: 1 },
  concurrent_with:          { color: '#9ca3af', dash: true, label: 'Concurrent', strokeWidth: 1 },
  immediate_precursor:      { color: '#9ca3af', dash: true, label: 'Précurseur immédiat', strokeWidth: 1 },
  long_term_precursor:      { color: '#78716c', dash: true, label: 'Précurseur historique', strokeWidth: 1 },

  // ── Causal (solid red/orange, thick) ──
  causes:                   { color: '#dc2626', label: 'Causé par', strokeWidth: 3 },
  contributes_to:           { color: '#ea580c', label: 'Contribue à', strokeWidth: 2 },
  enables:                  { color: '#f97316', label: 'Rend possible', strokeWidth: 2 },
  triggers:                 { color: '#dc2626', label: 'Déclenché par', strokeWidth: 3 },
  prevents:                 { color: '#991b1b', dash: true, label: 'Empêche', strokeWidth: 2 },

  // ── Contextual (dotted stone, thin) ──
  background_context:       { color: '#78716c', dash: true, label: 'Contexte', strokeWidth: 1 },
  related_to:               { color: '#8b5cf6', dash: true, label: 'Relié à', strokeWidth: 1 },
  same_storyline:           { color: '#6b7280', dash: true, label: 'Même fil', strokeWidth: 1 },

  // ── Corollary (dashed purple, medium) ──
  response_to:              { color: '#7c3aed', dash: true, label: 'Réponse à', strokeWidth: 2 },
  spillover_from:           { color: '#8b5cf6', dash: true, label: 'Retombée', strokeWidth: 2 },
  retaliation_to:           { color: '#6d28d9', dash: true, label: 'Représailles', strokeWidth: 2 },
  market_reaction_to:       { color: '#22c55e', dash: true, label: 'Réaction marché', strokeWidth: 2 },
  policy_reaction_to:       { color: '#2563eb', dash: true, label: 'Réaction politique', strokeWidth: 2 },
  parallel_development:     { color: '#6366f1', dash: true, label: 'Développement parallèle', strokeWidth: 2 },

  // ── Outcome (solid teal, medium) ──
  may_lead_to:              { color: '#14b8a6', label: 'Peut mener à', strokeWidth: 2 },
  raises_probability:       { color: '#22c55e', label: '↑ Probabilité', strokeWidth: 2 },
  lowers_probability:       { color: '#ef4444', label: '↓ Probabilité', strokeWidth: 2 },
  outcome_of:               { color: '#14b8a6', dash: true, label: 'Issu de', strokeWidth: 2 },

  // ── Legacy compat ──
  precedes:                 { color: '#9ca3af', dash: true, label: 'Précède', strokeWidth: 1 },
  parallel:                 { color: '#6366f1', dash: true, label: 'Parallèle', strokeWidth: 2 },
  corollary:                { color: '#8b5cf6', dash: true, label: 'Corollaire', strokeWidth: 2 },
  leads_to:                 { color: '#f59e0b', label: 'Mène à', strokeWidth: 2 },
}
