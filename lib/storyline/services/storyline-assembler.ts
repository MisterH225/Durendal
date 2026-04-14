import type {
  CandidateItem,
  SourceArticle,
  StorylineAnalysis,
  StorylineAnalysisEntry,
  StorylineCard,
  StorylineEdge,
  StorylineResult,
  StorylineCardType,
  StorylineOutcome,
  TemporalPosition,
  RelationCategory,
  RelationSubtype,
  TemporalSubtype,
} from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'

let nextId = 0
function uid(): string { return `sc-${++nextId}-${Date.now().toString(36)}` }

const POSITION_ORDER: Record<TemporalPosition, number> = {
  deep_past: 0,
  past: 1,
  recent: 2,
  anchor: 3,
  concurrent: 4,
  consequence: 5,
  future: 6,
}

const TEMPORAL_TO_POSITION: Record<string, TemporalPosition> = {
  long_term_precursor: 'deep_past',
  before: 'past',
  immediate_precursor: 'recent',
  concurrent_with: 'concurrent',
  after: 'consequence',
}

function inferCardType(candidate: CandidateItem): StorylineCardType {
  if (candidate.platformRefType === 'forecast_event' || candidate.platformRefType === 'intel_event') return 'event'
  if (candidate.platformRefType === 'question') return 'event'
  if (candidate.platformRefType === 'signal' || candidate.platformRefType === 'external_signal') return 'article'
  if (candidate.sourceType === 'perplexity' || candidate.sourceType === 'gemini') return 'article'
  return 'context'
}

function matchCandidateToAnalysis(
  candidate: CandidateItem,
  timeline: StorylineAnalysisEntry[],
): StorylineAnalysisEntry | null {
  const normalTitle = candidate.title.toLowerCase().slice(0, 60)

  for (const entry of timeline) {
    const ref = entry.candidateRef.toLowerCase()
    if (ref.includes(normalTitle) || normalTitle.includes(ref.slice(0, 40))) {
      return entry
    }
    const refIndex = ref.match(/^\[(\d+)\]/)
    if (refIndex) continue

    const refWords = ref.split(/\s+/).filter(w => w.length > 3)
    const titleWords = normalTitle.split(/\s+/).filter(w => w.length > 3)
    let overlap = 0
    for (const w of refWords) {
      if (titleWords.some(tw => tw.includes(w) || w.includes(tw))) overlap++
    }
    if (refWords.length > 0 && overlap / refWords.length > 0.5) return entry
  }

  return null
}

function resolveTemporalPosition(match: StorylineAnalysisEntry | null, candidate: CandidateItem, anchor: AnchorContext): TemporalPosition {
  if (match) {
    return TEMPORAL_TO_POSITION[match.temporalRelation] ?? inferPositionFromDate(candidate, anchor)
  }
  return inferPositionFromDate(candidate, anchor)
}

function inferPositionFromDate(c: CandidateItem, anchor: AnchorContext): TemporalPosition {
  if (!c.date || !anchor.date) return 'concurrent'
  if (c.date < anchor.date) {
    const daysBefore = Math.round((new Date(anchor.date).getTime() - new Date(c.date).getTime()) / 86400000)
    if (daysBefore > 365) return 'deep_past'
    if (daysBefore > 30) return 'past'
    return 'recent'
  }
  if (c.date > anchor.date) return 'consequence'
  return 'concurrent'
}

function findAnalysisEntryByRef(
  ref: string,
  timeline: StorylineAnalysisEntry[],
): StorylineAnalysisEntry | null {
  if (!ref) return null
  const lower = ref.toLowerCase()
  for (const entry of timeline) {
    if (entry.candidateRef.toLowerCase() === lower) return entry
    if (entry.candidateRef.toLowerCase().includes(lower.slice(0, 30))) return entry
    if (lower.includes(entry.candidateRef.toLowerCase().slice(0, 30))) return entry
  }
  return null
}

export function assembleStoryline(
  anchor: AnchorContext,
  candidates: CandidateItem[],
  analysis: StorylineAnalysis,
): StorylineResult {
  nextId = 0
  const cards: StorylineCard[] = []
  const edges: StorylineEdge[] = []

  const anchorCard: StorylineCard = {
    id: uid(),
    cardType: 'event',
    temporalPosition: 'anchor',
    title: anchor.title,
    summary: analysis.anchor?.summary || anchor.summary,
    date: anchor.date,
    confidence: 1,
    entities: anchor.entities ?? [],
    regionTags: [],
    sectorTags: [],
    sourceUrls: anchor.url ? [anchor.url] : [],
    platformRefType: anchor.platformRefType,
    platformRefId: anchor.platformRefId,
    importance: 10,
    sortOrder: POSITION_ORDER.anchor * 100,
    isTrunk: true,
    isCorollary: false,
  }
  cards.push(anchorCard)

  // Build cards for all matched candidates
  const cardByRef = new Map<string, StorylineCard>()
  const matchByCard = new Map<string, StorylineAnalysisEntry>()

  const matchedPairs = candidates.map((c, i) => ({
    index: i,
    candidate: c,
    match: matchCandidateToAnalysis(c, analysis.timeline),
  }))

  // Separate trunk vs corollary events
  const trunkPairs = matchedPairs.filter(p => p.match && !p.match.isCorollary)
  const corollaryPairs = matchedPairs.filter(p => p.match?.isCorollary)
  const unmatchedPairs = matchedPairs.filter(p => !p.match)

  // Sort trunk by date for chain ordering
  trunkPairs.sort((a, b) => {
    const da = a.candidate.date ?? ''
    const db = b.candidate.date ?? ''
    return da.localeCompare(db)
  })

  let trunkOrder = 0
  for (const { candidate: c, match } of trunkPairs) {
    if (!match) continue
    const temporalPosition = resolveTemporalPosition(match, c, anchor)

    const card: StorylineCard = {
      id: uid(),
      cardType: inferCardType(c),
      temporalPosition,
      title: c.title,
      summary: match.explanation || c.summary,
      date: c.date,
      confidence: match.causalConfidence > 0 ? match.causalConfidence : 0.5,
      entities: match.entities ?? c.entities ?? [],
      regionTags: c.regionTags ?? [],
      sectorTags: c.sectorTags ?? [],
      sourceUrls: c.url ? [c.url] : [],
      sourceArticles: match.sourceArticles ?? (c.url ? [{ title: c.title.slice(0, 60), url: c.url }] : []),
      platformRefType: c.platformRefType,
      platformRefId: c.platformRefId,
      importance: match.relationCategory === 'causal' ? 8 : 5,
      sortOrder: trunkOrder++,
      isTrunk: true,
      isCorollary: false,
    }
    cards.push(card)
    cardByRef.set(match.candidateRef, card)
    matchByCard.set(card.id, match)
  }

  // Build CHAIN EDGES for trunk: each card → next card → ... → anchor
  const trunkCards = cards.filter(c => c.isTrunk && c.temporalPosition !== 'anchor' && c.temporalPosition !== 'future')
    .sort((a, b) => a.sortOrder - b.sortOrder)

  for (let i = 0; i < trunkCards.length; i++) {
    const current = trunkCards[i]
    const next = i < trunkCards.length - 1 ? trunkCards[i + 1] : anchorCard
    const match = matchByCard.get(current.id)

    // Check if LLM specified a specific predecessor
    let predecessorCard: StorylineCard | undefined
    if (match?.chainPredecessorRef) {
      predecessorCard = cardByRef.get(match.chainPredecessorRef) ?? undefined
    }

    // Chain edge: current → next (or LLM-specified predecessor ← current)
    const edgeCategory: RelationCategory = match?.relationCategory === 'causal' ? 'causal' : 'contextual'
    const edgeSubtype = match?.relationCategory === 'causal'
      ? (match.relationSubtype || 'causes')
      : 'background_context'

    edges.push({
      id: uid(),
      sourceCardId: current.id,
      targetCardId: next.id,
      relationCategory: edgeCategory,
      relationSubtype: edgeSubtype as RelationSubtype,
      confidence: match?.causalConfidence ?? 0.5,
      explanation: match?.explanation ?? '',
      causalEvidence: match?.causalEvidence,
      isTrunk: true,
    })
  }

  // Build corollary cards — attached to their trunk card
  for (const { candidate: c, match } of corollaryPairs) {
    if (!match) continue
    const temporalPosition = resolveTemporalPosition(match, c, anchor)

    const attachedTrunkCard = match.attachedToRef
      ? cardByRef.get(match.attachedToRef) ?? anchorCard
      : anchorCard

    const card: StorylineCard = {
      id: uid(),
      cardType: inferCardType(c),
      temporalPosition,
      title: c.title,
      summary: match.explanation || c.summary,
      date: c.date,
      confidence: 0.5,
      entities: match.entities ?? c.entities ?? [],
      regionTags: c.regionTags ?? [],
      sectorTags: c.sectorTags ?? [],
      sourceUrls: c.url ? [c.url] : [],
      sourceArticles: match.sourceArticles ?? (c.url ? [{ title: c.title.slice(0, 60), url: c.url }] : []),
      platformRefType: c.platformRefType,
      platformRefId: c.platformRefId,
      importance: 4,
      sortOrder: POSITION_ORDER[temporalPosition] * 100 + cards.length,
      isTrunk: false,
      isCorollary: true,
      attachedToCardId: attachedTrunkCard.id,
    }
    cards.push(card)
    cardByRef.set(match.candidateRef, card)

    edges.push({
      id: uid(),
      sourceCardId: attachedTrunkCard.id,
      targetCardId: card.id,
      relationCategory: 'corollary' as RelationCategory,
      relationSubtype: (match.relationSubtype || 'spillover_from') as RelationSubtype,
      confidence: 0.6,
      explanation: match.explanation,
      isTrunk: false,
    })
  }

  // Handle unmatched candidates as minor context nodes (no edges to avoid clutter)
  for (const { candidate: c, index: i } of unmatchedPairs.slice(0, 5)) {
    const temporalPosition = inferPositionFromDate(c, anchor)
    cards.push({
      id: uid(),
      cardType: inferCardType(c),
      temporalPosition,
      title: c.title,
      summary: c.summary,
      date: c.date,
      confidence: 0.2,
      entities: c.entities ?? [],
      regionTags: c.regionTags ?? [],
      sectorTags: c.sectorTags ?? [],
      sourceUrls: c.url ? [c.url] : [],
      sourceArticles: c.url ? [{ title: c.title.slice(0, 60), url: c.url }] : [],
      platformRefType: c.platformRefType,
      platformRefId: c.platformRefId,
      importance: 2,
      sortOrder: POSITION_ORDER[temporalPosition] * 100 + 90 + i,
      isTrunk: false,
      isCorollary: false,
    })
  }

  addOutcomeCards(cards, edges, anchorCard.id, analysis.outcomes)

  cards.sort((a, b) => a.sortOrder - b.sortOrder)

  return {
    anchorType: anchor.platformRefType ? 'article' : 'keyword',
    anchorRef: anchor.platformRefId ?? anchor.keywords.join(' '),
    anchorTitle: anchor.title,
    anchorSummary: anchor.summary,
    cards,
    edges,
    narrative: analysis.narrative,
    status: 'ready',
  }
}

function addOutcomeCards(
  cards: StorylineCard[],
  edges: StorylineEdge[],
  anchorCardId: string,
  outcomes: StorylineOutcome[],
): void {
  for (const outcome of outcomes) {
    const card: StorylineCard = {
      id: uid(),
      cardType: 'outcome',
      temporalPosition: 'future',
      title: outcome.title,
      summary: outcome.reasoning,
      probability: outcome.probability,
      probabilitySource: outcome.probabilitySource ?? 'ai_estimate',
      confidence: outcome.probability,
      entities: [],
      regionTags: [],
      sectorTags: [],
      sourceUrls: [],
      importance: Math.round(outcome.probability * 8) + 2,
      sortOrder: POSITION_ORDER.future * 100 + cards.length,
      supportingEvidence: outcome.supportingEvidence,
      contradictingEvidence: outcome.contradictingEvidence,
      outcomeStatus: 'projected',
      metadata: { timeHorizon: outcome.timeHorizon },
      isTrunk: false,
      isCorollary: false,
    }
    cards.push(card)

    edges.push({
      id: uid(),
      sourceCardId: anchorCardId,
      targetCardId: card.id,
      relationCategory: 'outcome',
      relationSubtype: 'may_lead_to',
      confidence: outcome.probability,
      explanation: `Scénario projeté (${outcome.timeHorizon}) — ${outcome.reasoning.slice(0, 100)}`,
      isTrunk: false,
    })
  }
}
