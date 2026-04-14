import type {
  CandidateItem,
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
  CounterfactualRelationLabel,
} from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'
import { runCounterfactualChecks } from './counterfactual-check'

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

const CF_CAUSAL_LABELS = new Set<CounterfactualRelationLabel>([
  'triggers', 'likely_cause', 'contributes_to',
])

function cfLabelToEdge(label: CounterfactualRelationLabel): {
  category: RelationCategory
  subtype: string
  isTrunk: boolean
} {
  switch (label) {
    case 'triggers':             return { category: 'causal', subtype: 'triggers', isTrunk: true }
    case 'likely_cause':         return { category: 'causal', subtype: 'causes', isTrunk: true }
    case 'contributes_to':       return { category: 'causal', subtype: 'contributes_to', isTrunk: true }
    case 'response_to':          return { category: 'corollary', subtype: 'response_to', isTrunk: false }
    case 'spillover_from':       return { category: 'corollary', subtype: 'spillover_from', isTrunk: false }
    case 'long_term_precursor':  return { category: 'contextual', subtype: 'background_context', isTrunk: false }
    case 'background_context':   return { category: 'contextual', subtype: 'background_context', isTrunk: false }
    case 'preceded_by':
    default:                     return { category: 'contextual', subtype: 'related_to', isTrunk: false }
  }
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
    summary: anchor.summary,
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
  }
  cards.push(anchorCard)

  const matchedPairs = candidates.map((c, i) => ({
    index: i,
    candidate: c,
    match: matchCandidateToAnalysis(c, analysis.timeline),
  }))

  // Run counterfactual checks on all LLM-matched entries
  const cfInputEntries = matchedPairs
    .filter(p => p.match !== null)
    .map(p => ({
      candidateTitle: p.candidate.title,
      candidateSummary: p.candidate.summary ?? '',
      candidateDate: p.candidate.date,
      candidateEntities: p.match!.entities ?? p.candidate.entities ?? [],
      candidateRegions: p.candidate.regionTags ?? [],
      candidateSectors: p.candidate.sectorTags ?? [],
      temporalRelation: p.match!.temporalRelation,
      llmRelationCategory: p.match!.relationCategory,
      llmRelationSubtype: p.match!.relationSubtype,
      llmCausalConfidence: p.match!.causalConfidence,
      llmCausalEvidence: p.match!.causalEvidence,
      llmExplanation: p.match!.explanation,
    }))

  const cfResults = cfInputEntries.length > 0
    ? runCounterfactualChecks(
        { title: anchor.title, summary: anchor.summary ?? '', date: anchor.date ?? '', entities: anchor.entities ?? [] },
        cfInputEntries,
      )
    : []

  // Map cfResults back by candidate title for lookup
  const cfResultByTitle = new Map<string, typeof cfResults[number]>()
  cfInputEntries.forEach((entry, idx) => {
    cfResultByTitle.set(entry.candidateTitle, cfResults[idx])
  })

  for (const { index: i, candidate: c, match } of matchedPairs) {
    const temporalPosition = resolveTemporalPosition(match, c, anchor)
    const cfResult = match ? cfResultByTitle.get(c.title) : undefined
    const isCausal = cfResult ? CF_CAUSAL_LABELS.has(cfResult.finalLabel) : false

    const confidence = cfResult?.confidence ?? (match ? Math.max(0.1, match.causalConfidence) : 0.2)

    const card: StorylineCard = {
      id: uid(),
      cardType: inferCardType(c),
      temporalPosition,
      title: c.title,
      summary: c.summary || match?.explanation,
      date: c.date,
      confidence,
      entities: match?.entities ?? c.entities ?? [],
      regionTags: c.regionTags ?? [],
      sectorTags: c.sectorTags ?? [],
      sourceUrls: c.url ? [c.url] : [],
      platformRefType: c.platformRefType,
      platformRefId: c.platformRefId,
      importance: isCausal ? Math.round(confidence * 8) + 4 : (match ? 4 : 3),
      sortOrder: POSITION_ORDER[temporalPosition] * 100 + i,
    }
    cards.push(card)

    if (!match) continue

    const isPast = POSITION_ORDER[temporalPosition] < POSITION_ORDER.anchor
    const sourceId = isPast ? card.id : anchorCard.id
    const targetId = isPast ? anchorCard.id : card.id

    // Temporal edge (always present)
    edges.push({
      id: uid(),
      sourceCardId: sourceId,
      targetCardId: targetId,
      relationCategory: 'temporal' as RelationCategory,
      relationSubtype: match.temporalRelation as RelationSubtype,
      confidence: 0.9,
      explanation: match.explanation,
      isTrunk: false,
    })

    // Semantic edge — determined by counterfactual check if available
    if (cfResult) {
      const mapped = cfLabelToEdge(cfResult.finalLabel)
      const enriched = cfResult.wasDowngraded
        ? `${match.explanation} [CF: ${cfResult.explanation.downgrades[0] ?? 'rétrogradé'}]`
        : match.explanation

      edges.push({
        id: uid(),
        sourceCardId: sourceId,
        targetCardId: targetId,
        relationCategory: mapped.category,
        relationSubtype: mapped.subtype as RelationSubtype,
        confidence: cfResult.confidence,
        explanation: enriched,
        causalEvidence: mapped.isTrunk ? (match.causalEvidence || cfResult.explanation.finalRationale) : undefined,
        isTrunk: mapped.isTrunk,
      })
    } else if (match.relationCategory === 'corollary') {
      edges.push({
        id: uid(),
        sourceCardId: sourceId,
        targetCardId: targetId,
        relationCategory: 'corollary' as RelationCategory,
        relationSubtype: match.relationSubtype as RelationSubtype,
        confidence: 0.6,
        explanation: match.explanation,
        isTrunk: false,
      })
    } else {
      edges.push({
        id: uid(),
        sourceCardId: sourceId,
        targetCardId: targetId,
        relationCategory: 'contextual' as RelationCategory,
        relationSubtype: (match.relationSubtype || 'background_context') as RelationSubtype,
        confidence: 0.5,
        explanation: match.explanation,
        isTrunk: false,
      })
    }
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
