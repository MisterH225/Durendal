import type {
  StorylineCard,
  StorylineEdge,
  StorylineResult,
  StorylineCardType,
  TemporalPosition,
  RelationCategory,
  RelationSubtype,
} from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'
import type { EventCluster } from '../types/event-cluster'
import type { EventRelation } from '../types/event-relation'
import type { OutcomePrediction } from '../types/outcome-prediction'
import { ANCHOR_CLUSTER_ID } from './relation-detector'

function uid(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `sc-${Date.now().toString(36)}-${rand}`
}

const POSITION_ORDER: Record<TemporalPosition, number> = {
  deep_past: 0,
  past: 1,
  recent: 2,
  anchor: 3,
  concurrent: 4,
  consequence: 5,
  future: 6,
}

function inferCardTypeFromCluster(cluster: EventCluster): StorylineCardType {
  if (cluster.platformRefType === 'forecast_event' || cluster.platformRefType === 'intel_event') return 'event'
  if (cluster.platformRefType === 'question') return 'event'
  if (cluster.sourceType === 'perplexity' || cluster.sourceType === 'gemini') return 'article'
  return 'event'
}

function inferPositionFromClusterDate(c: EventCluster, anchor: AnchorContext): TemporalPosition {
  if (!c.eventDate || !anchor.date) return 'concurrent'
  if (c.eventDate < anchor.date) {
    const daysBefore = Math.round((new Date(anchor.date).getTime() - new Date(c.eventDate).getTime()) / 86400000)
    if (daysBefore > 365) return 'deep_past'
    if (daysBefore > 30) return 'past'
    return 'recent'
  }
  if (c.eventDate > anchor.date) return 'consequence'
  return 'concurrent'
}

// ═══════════════════════════════════════════════════════════════════════════
// Trunk detection via BFS on causal relations (graph, not chain)
// ═══════════════════════════════════════════════════════════════════════════

function detectTrunkClusters(relations: EventRelation[]): Set<string> {
  const trunk = new Set<string>([ANCHOR_CLUSTER_ID])
  const queue = [ANCHOR_CLUSTER_ID]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const rel of relations) {
      if (
        rel.targetClusterId === current &&
        rel.semanticCategory === 'causal' &&
        !trunk.has(rel.sourceClusterId)
      ) {
        trunk.add(rel.sourceClusterId)
        queue.push(rel.sourceClusterId)
      }
    }
  }

  return trunk
}

// ═══════════════════════════════════════════════════════════════════════════
// Main assembly: relation-graph-based
// ═══════════════════════════════════════════════════════════════════════════

export function assembleStorylineGraph(
  anchor: AnchorContext,
  clusters: EventCluster[],
  relations: EventRelation[],
  outcomes: OutcomePrediction[],
  narrative?: string,
): StorylineResult {
  const cards: StorylineCard[] = []
  const edges: StorylineEdge[] = []

  const corollaryRelations = relations.filter(r => r.semanticCategory === 'corollary')
  const corollaryTargetIds = new Set(corollaryRelations.map(r => r.targetClusterId))

  const causalTrunkIds = detectTrunkClusters(relations)
  const hasCausalTrunk = Array.from(causalTrunkIds).some(id => id !== ANCHOR_CLUSTER_ID)

  function clusterBeforeAnchor(c: EventCluster): boolean {
    if (!anchor.date) return true
    if (!c.eventDate) return true
    return c.eventDate < anchor.date
  }

  /** Tronc visuel : causalité si dispo, sinon antériorité par rapport à l’ancre (évite 0 nœud à gauche). */
  let layoutTrunkIds = causalTrunkIds
  if (!hasCausalTrunk && clusters.length > 0) {
    layoutTrunkIds = new Set<string>([ANCHOR_CLUSTER_ID])
    for (const c of clusters) {
      if (corollaryTargetIds.has(c.clusterId)) continue
      if (clusterBeforeAnchor(c)) layoutTrunkIds.add(c.clusterId)
    }
  }

  // Anchor card
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
    isTrunk: true,
    isCorollary: false,
  }
  cards.push(anchorCard)

  const cardByClusterId = new Map<string, StorylineCard>()
  cardByClusterId.set(ANCHOR_CLUSTER_ID, anchorCard)

  // Sort clusters chronologically
  const sortedClusters = [...clusters].sort((a, b) =>
    (a.eventDate ?? '').localeCompare(b.eventDate ?? ''),
  )

  // Build cluster cards
  let trunkOrder = 0
  for (const cluster of sortedClusters) {
    const isTrunk = layoutTrunkIds.has(cluster.clusterId)
    const isCorollary = corollaryTargetIds.has(cluster.clusterId)
    const temporalPosition = inferPositionFromClusterDate(cluster, anchor)

    const bestRelation = relations.find(
      r => r.sourceClusterId === cluster.clusterId || r.targetClusterId === cluster.clusterId,
    )

    // For corollaries, find which trunk card they attach to
    let attachedToCardId: string | undefined
    if (isCorollary) {
      const corolRel = corollaryRelations.find(r => r.targetClusterId === cluster.clusterId)
      if (corolRel) {
        const attachedCard = cardByClusterId.get(corolRel.sourceClusterId)
        attachedToCardId = attachedCard?.id
      }
    }

    const card: StorylineCard = {
      id: uid(),
      cardType: inferCardTypeFromCluster(cluster),
      temporalPosition,
      title: cluster.canonicalTitle,
      summary: bestRelation?.explanation || cluster.summary,
      date: cluster.eventDate ?? undefined,
      confidence: bestRelation?.confidence ?? 0.5,
      entities: cluster.entities,
      regionTags: cluster.regionTags,
      sectorTags: cluster.sectorTags,
      sourceUrls: cluster.sourceArticles.map(a => a.url),
      sourceArticles: cluster.sourceArticles.slice(0, 3),
      platformRefType: cluster.platformRefType,
      platformRefId: cluster.platformRefId,
      importance: isTrunk ? 8 : isCorollary ? 4 : 3,
      sortOrder: isTrunk ? trunkOrder++ : POSITION_ORDER[temporalPosition] * 100 + cards.length,
      isTrunk,
      isCorollary,
      attachedToCardId,
      metadata: {
        clusterId: cluster.clusterId,
        clusterSize: cluster.clusterSize,
        eventDateConfidence: cluster.eventDateConfidence,
        counterfactualScore: bestRelation?.counterfactualScore,
        wasDowngraded: bestRelation?.wasDowngraded,
      },
    }
    cards.push(card)
    cardByClusterId.set(cluster.clusterId, card)
  }

  // Build edges from semantic relations (temporal cluster → ancre inclus pour lier la timeline)
  for (const rel of relations) {
    if (rel.semanticCategory === 'temporal' && rel.targetClusterId !== ANCHOR_CLUSTER_ID) continue

    const sourceCard = cardByClusterId.get(rel.sourceClusterId)
    const targetCard = cardByClusterId.get(rel.targetClusterId)
    if (!sourceCard || !targetCard) continue

    edges.push({
      id: uid(),
      sourceCardId: sourceCard.id,
      targetCardId: targetCard.id,
      relationCategory: rel.semanticCategory as RelationCategory,
      relationSubtype: rel.semanticSubtype as RelationSubtype,
      confidence: rel.confidence,
      explanation: rel.explanation,
      causalEvidence: rel.mechanismEvidence || undefined,
      isTrunk: rel.semanticCategory === 'causal' && layoutTrunkIds.has(rel.sourceClusterId),
    })
  }

  // Outcome cards and edges
  for (const outcome of outcomes) {
    const card: StorylineCard = {
      id: uid(),
      cardType: 'outcome',
      temporalPosition: 'future',
      title: outcome.title,
      summary: outcome.reasoning,
      probability: outcome.probability,
      probabilitySource: outcome.probabilitySource,
      confidence: outcome.probability,
      entities: [],
      regionTags: [],
      sectorTags: [],
      sourceUrls: [],
      importance: Math.round(outcome.probability * 8) + 2,
      sortOrder: POSITION_ORDER.future * 100 + cards.length,
      supportingEvidence: outcome.supportingEvidence,
      contradictingEvidence: outcome.contradictingEvidence,
      outcomeStatus: outcome.status === 'open' ? 'projected' : outcome.status as StorylineCard['outcomeStatus'],
      metadata: {
        timeHorizon: outcome.timeHorizon,
        confidenceLevel: outcome.confidenceLevel,
        outcomeId: outcome.id,
      },
      isTrunk: false,
      isCorollary: false,
    }
    cards.push(card)

    edges.push({
      id: uid(),
      sourceCardId: anchorCard.id,
      targetCardId: card.id,
      relationCategory: 'outcome',
      relationSubtype: 'may_lead_to',
      confidence: outcome.probability,
      explanation: `Scénario projeté (${outcome.timeHorizon}) — ${outcome.reasoning.slice(0, 100)}`,
      isTrunk: false,
    })

    for (const driverClusterId of outcome.drivenByClusterIds) {
      const driverCard = cardByClusterId.get(driverClusterId)
      if (driverCard) {
        edges.push({
          id: uid(),
          sourceCardId: driverCard.id,
          targetCardId: card.id,
          relationCategory: 'outcome',
          relationSubtype: 'raises_probability_of',
          confidence: 0.5,
          explanation: `${driverCard.title} contribue à ce scénario`,
          isTrunk: false,
        })
      }
    }
  }

  cards.sort((a, b) => a.sortOrder - b.sortOrder)

  return {
    anchorType: anchor.platformRefType ? 'article' : 'keyword',
    anchorRef: anchor.platformRefId ?? anchor.keywords.join(' '),
    anchorTitle: anchor.title,
    anchorSummary: anchor.summary,
    cards,
    edges,
    narrative: narrative ?? '',
    status: 'ready',
  }
}
