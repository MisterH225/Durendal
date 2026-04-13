import type {
  CandidateItem,
  StorylineAnalysis,
  StorylineCard,
  StorylineEdge,
  StorylineResult,
  StorylineCardType,
  StorylineEdgeType,
  TemporalPosition,
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

const ROLE_TO_EDGE: Record<string, StorylineEdgeType> = {
  root_cause: 'causes',
  precursor: 'precedes',
  trigger: 'triggers',
  parallel: 'parallel',
  effect: 'leads_to',
  corollary: 'corollary',
  reaction: 'leads_to',
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
  timeline: StorylineAnalysis['timeline'],
): StorylineAnalysis['timeline'][number] | null {
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

export function assembleStoryline(
  anchor: AnchorContext,
  candidates: CandidateItem[],
  analysis: StorylineAnalysis,
): StorylineResult {
  nextId = 0
  const cards: StorylineCard[] = []
  const edges: StorylineEdge[] = []
  const cardIdMap = new Map<number, string>()

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

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    const match = matchCandidateToAnalysis(c, analysis.timeline)

    const temporalPosition: TemporalPosition = match?.temporalPosition ?? inferPosition(c, anchor)
    const confidence = match?.causalConfidence ?? 0.3

    if (confidence < 0.15) continue

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
      importance: Math.round(confidence * 8) + 2,
      sortOrder: POSITION_ORDER[temporalPosition] * 100 + i,
    }
    cards.push(card)
    cardIdMap.set(i, card.id)

    if (match) {
      const edgeType = ROLE_TO_EDGE[match.causalRole] ?? 'leads_to'
      const isTrunk = match.causalRole === 'root_cause' || match.causalRole === 'precursor' || match.causalRole === 'trigger' || match.causalRole === 'effect'

      const isPast = POSITION_ORDER[temporalPosition] < POSITION_ORDER.anchor
      const sourceId = isPast ? card.id : anchorCard.id
      const targetId = isPast ? anchorCard.id : card.id

      edges.push({
        id: uid(),
        sourceCardId: sourceId,
        targetCardId: targetId,
        relationType: edgeType,
        confidence: match.causalConfidence,
        explanation: match.explanation,
        isTrunk,
      })
    }
  }

  for (const outcome of analysis.outcomes) {
    const card: StorylineCard = {
      id: uid(),
      cardType: 'outcome',
      temporalPosition: 'future',
      title: outcome.title,
      summary: outcome.reasoning,
      probability: outcome.probability,
      probabilitySource: 'ai_estimate',
      confidence: outcome.probability,
      entities: [],
      regionTags: [],
      sectorTags: [],
      sourceUrls: [],
      importance: Math.round(outcome.probability * 8) + 2,
      sortOrder: POSITION_ORDER.future * 100 + cards.length,
      metadata: { timeHorizon: outcome.timeHorizon },
    }
    cards.push(card)

    edges.push({
      id: uid(),
      sourceCardId: anchorCard.id,
      targetCardId: card.id,
      relationType: 'leads_to',
      confidence: outcome.probability,
      explanation: `Scénario projeté (${outcome.timeHorizon})`,
      isTrunk: false,
    })
  }

  buildCrossEdges(cards, edges, analysis)

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

function inferPosition(c: CandidateItem, anchor: AnchorContext): TemporalPosition {
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

function buildCrossEdges(
  cards: StorylineCard[],
  edges: StorylineEdge[],
  analysis: StorylineAnalysis,
): void {
  const trunkCards = cards
    .filter(c => c.temporalPosition !== 'future' && c.temporalPosition !== 'concurrent')
    .sort((a, b) => a.sortOrder - b.sortOrder)

  for (let i = 0; i < trunkCards.length - 1; i++) {
    const a = trunkCards[i]
    const b = trunkCards[i + 1]
    const alreadyLinked = edges.some(
      e => (e.sourceCardId === a.id && e.targetCardId === b.id) ||
           (e.sourceCardId === b.id && e.targetCardId === a.id),
    )
    if (!alreadyLinked && a.id !== b.id) {
      edges.push({
        id: uid(),
        sourceCardId: a.id,
        targetCardId: b.id,
        relationType: 'precedes',
        confidence: 0.5,
        explanation: 'Séquence chronologique',
        isTrunk: true,
      })
    }
  }
}
