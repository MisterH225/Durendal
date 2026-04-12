import type {
  IntelligenceGraphNode, IntelligenceGraphEdge,
  GraphSearchResult, GraphFilters, GraphNodeType,
} from './types'

// ============================================================================
// Intelligence Graph Search Engine — v4
// Works with both mock and real Supabase data.
// When real data is provided, the scoring thresholds are relaxed because
// Supabase ilike already pre-filters relevance.
// ============================================================================

const MAX_ANCHOR_NODES = 8
const MAX_NEIGHBORHOOD_DEPTH = 1
const MAX_TOTAL_NODES = 50
const MIN_EXPANSION_CONFIDENCE = 0.5

const STOPWORDS = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'l', 'un', 'une',
  'et', 'en', 'au', 'aux', 'a', 'ce', 'se', 'ne', 'pas',
  'par', 'pour', 'sur', 'avec', 'dans', 'qui', 'que', 'est',
  'son', 'sa', 'ses', 'ou', 'the', 'of', 'in', 'and', 'to',
  'on', 'at', 'by', 'an', 'is', 'it', 'as', 'or', 'be',
  'from', 'with', 'for', 'this', 'that', 'are', 'was', 'has',
])

interface ScoredNode {
  node: IntelligenceGraphNode
  keywordScore: number
  tokenHitRatio: number
  totalScore: number
  matchType: 'exact' | 'partial' | 'tag' | 'entity' | 'semantic'
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, "'")
    .trim()
}

function tokenize(query: string): string[] {
  return normalizeText(query)
    .split(/[\s\-_/,.;:!?']+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
}

function wordBoundaryMatch(haystack: string, token: string): boolean {
  const idx = haystack.indexOf(token)
  if (idx === -1) return false
  const before = idx === 0 || /[\s\-_/,.;:!?'()]/.test(haystack[idx - 1])
  const after = idx + token.length >= haystack.length || /[\s\-_/,.;:!?'()]/.test(haystack[idx + token.length])
  return before && after
}

function scoreNodeAgainstQuery(
  node: IntelligenceGraphNode,
  tokens: string[],
  normalizedQuery: string,
): ScoredNode | null {
  const label = normalizeText(node.label)
  const summary = normalizeText(node.summary ?? '')
  const subtitle = normalizeText(node.subtitle ?? '')
  const regions = (node.regionTags ?? []).map(normalizeText).join(' ')
  const sectors = (node.sectorTags ?? []).map(normalizeText).join(' ')

  let keywordScore = 0
  let matchType: ScoredNode['matchType'] = 'partial'
  let tokensHit = 0

  if (label === normalizedQuery) {
    keywordScore += 120
    matchType = 'exact'
    tokensHit = tokens.length
  } else if (label.includes(normalizedQuery)) {
    keywordScore += 80
    matchType = 'partial'
    tokensHit = tokens.length
  } else {
    for (const token of tokens) {
      let hit = false
      if (wordBoundaryMatch(label, token))    { keywordScore += 35; hit = true }
      if (wordBoundaryMatch(subtitle, token)) { keywordScore += 30; hit = true }
      if (wordBoundaryMatch(regions, token))  { keywordScore += 28; hit = true }
      if (wordBoundaryMatch(sectors, token))  { keywordScore += 15; hit = true }
      if (wordBoundaryMatch(summary, token))  { keywordScore += 10; hit = true }
      if (hit) tokensHit++
    }
  }

  const tokenHitRatio = tokens.length > 0 ? tokensHit / tokens.length : 0

  const minTokenCoverage = tokens.length <= 2 ? 0.3 : 0.2
  const minScore = tokens.length <= 2 ? 8 : 15

  if (keywordScore < minScore || tokenHitRatio < minTokenCoverage) return null

  if (label === normalizedQuery || label.includes(normalizedQuery)) {
    matchType = keywordScore >= 100 ? 'exact' : 'partial'
  } else if (wordBoundaryMatch(regions, normalizedQuery) || wordBoundaryMatch(sectors, normalizedQuery)) {
    matchType = 'tag'
  } else if (wordBoundaryMatch(subtitle, normalizedQuery)) {
    matchType = 'entity'
  }

  const importanceBoost = (node.importance ?? 5) * 1.2
  const typeWeight: Partial<Record<GraphNodeType, number>> = {
    event: 8, question: 6, entity: 5, article: 2, signal: 2,
  }
  const totalScore = keywordScore + importanceBoost + (typeWeight[node.type] ?? 1)

  return { node, keywordScore, tokenHitRatio, totalScore, matchType }
}

function expandNeighborhood(
  anchorIds: Set<string>,
  anchorRegions: Set<string>,
  allEdges: IntelligenceGraphEdge[],
  allNodesMap: Map<string, IntelligenceGraphNode>,
  depth: number,
  filters: GraphFilters,
): { nodes: Map<string, IntelligenceGraphNode>; edges: IntelligenceGraphEdge[] } {
  const resultNodes = new Map<string, IntelligenceGraphNode>()
  const resultEdges: IntelligenceGraphEdge[] = []
  const edgeSet = new Set<string>()
  let frontier = new Set(anchorIds)

  Array.from(anchorIds).forEach(id => {
    const node = allNodesMap.get(id)
    if (node) resultNodes.set(id, node)
  })

  const skipEdgeTypes = new Set([
    'belongs_to_region', 'belongs_to_sector', 'related_to',
  ])

  for (let d = 0; d < depth; d++) {
    const nextFrontier = new Set<string>()
    for (const edge of allEdges) {
      if (edgeSet.has(edge.id)) continue
      if (skipEdgeTypes.has(edge.type)) continue
      if ((edge.confidence ?? 1) < MIN_EXPANSION_CONFIDENCE) continue
      if (!filters.edgeTypes.includes(edge.type)) continue

      const srcInFrontier = frontier.has(edge.source)
      const tgtInFrontier = frontier.has(edge.target)
      if (!srcInFrontier && !tgtInFrontier) continue

      const neighborId = srcInFrontier ? edge.target : edge.source
      const neighborNode = allNodesMap.get(neighborId)
      if (!neighborNode) continue
      if (!filters.nodeTypes.includes(neighborNode.type)) continue

      if (!resultNodes.has(neighborId) && resultNodes.size < MAX_TOTAL_NODES) {
        resultNodes.set(neighborId, neighborNode)
        nextFrontier.add(neighborId)
      }

      if (resultNodes.has(edge.source) && resultNodes.has(edge.target)) {
        resultEdges.push(edge)
        edgeSet.add(edge.id)
      }
    }
    frontier = nextFrontier
    if (frontier.size === 0 || resultNodes.size >= MAX_TOTAL_NODES) break
  }

  return { nodes: resultNodes, edges: resultEdges }
}

function pruneWeakNodes(
  nodes: Map<string, IntelligenceGraphNode>,
  edges: IntelligenceGraphEdge[],
  anchorIds: Set<string>,
): { nodes: IntelligenceGraphNode[]; edges: IntelligenceGraphEdge[] } {
  const connectionCount = new Map<string, number>()
  for (const e of edges) {
    connectionCount.set(e.source, (connectionCount.get(e.source) ?? 0) + 1)
    connectionCount.set(e.target, (connectionCount.get(e.target) ?? 0) + 1)
  }

  const kept = new Set<string>()
  Array.from(nodes.keys()).forEach(id => {
    if (anchorIds.has(id) || (connectionCount.get(id) ?? 0) >= 1) kept.add(id)
  })

  const prunedNodes = Array.from(nodes.values()).filter(n => kept.has(n.id))
  const prunedEdges = edges.filter(e => kept.has(e.source) && kept.has(e.target))
  return { nodes: prunedNodes, edges: prunedEdges }
}

export function searchGraph(
  query: string,
  filters: GraphFilters,
  allNodes: IntelligenceGraphNode[] = [],
  allEdges: IntelligenceGraphEdge[] = [],
): GraphSearchResult {
  const normalizedQuery = normalizeText(query)
  const tokens = tokenize(query)

  const emptyResult: GraphSearchResult = {
    query,
    nodes: [],
    edges: [],
    anchorNodeIds: [],
    groupedMatches: { articles: [], events: [], entities: [], questions: [], signals: [], documents: [] },
    totals: { articles: 0, events: 0, entities: 0, questions: 0, signals: 0, documents: 0 },
  }

  if (tokens.length === 0) return emptyResult

  let filteredNodes = allNodes
  if (filters.nodeTypes.length < 10) {
    filteredNodes = allNodes.filter(n => filters.nodeTypes.includes(n.type))
  }
  if (filters.dateRange.from) {
    filteredNodes = filteredNodes.filter(n => !n.createdAt || n.createdAt >= filters.dateRange.from!)
  }
  if (filters.dateRange.to) {
    filteredNodes = filteredNodes.filter(n => !n.createdAt || n.createdAt <= filters.dateRange.to!)
  }

  const scored: ScoredNode[] = []
  for (const node of filteredNodes) {
    const result = scoreNodeAgainstQuery(node, tokens, normalizedQuery)
    if (result) scored.push(result)
  }

  if (scored.length === 0) return emptyResult

  scored.sort((a, b) => b.totalScore - a.totalScore)

  const anchors = scored.slice(0, MAX_ANCHOR_NODES)
  const anchorIds = new Set(anchors.map(a => a.node.id))

  const anchorRegions = new Set<string>()
  anchors.forEach(a => {
    (a.node.regionTags ?? []).forEach(r => anchorRegions.add(normalizeText(r)))
  })

  const nodesMap = new Map(allNodes.map(n => [n.id, n]))

  const { nodes: subgraphNodes, edges: subgraphEdges } = expandNeighborhood(
    anchorIds,
    anchorRegions,
    allEdges,
    nodesMap,
    MAX_NEIGHBORHOOD_DEPTH,
    filters,
  )

  const { nodes: prunedNodes, edges: prunedEdges } = pruneWeakNodes(
    subgraphNodes,
    subgraphEdges,
    anchorIds,
  )

  const anchorNodeIds = anchors.map(a => a.node.id)

  const groupedMatches: GraphSearchResult['groupedMatches'] = {
    articles: [], events: [], entities: [], questions: [], signals: [], documents: [],
  }
  for (const a of anchors) {
    const t = a.node.type
    if (t === 'article') groupedMatches.articles.push(a.node.id)
    else if (t === 'event') groupedMatches.events.push(a.node.id)
    else if (t === 'entity') groupedMatches.entities.push(a.node.id)
    else if (t === 'question') groupedMatches.questions.push(a.node.id)
    else if (t === 'signal' || t === 'market_signal') groupedMatches.signals.push(a.node.id)
    else if (t === 'document') groupedMatches.documents.push(a.node.id)
  }

  return {
    query,
    nodes: prunedNodes,
    edges: prunedEdges,
    anchorNodeIds,
    groupedMatches,
    totals: {
      articles: groupedMatches.articles.length,
      events: groupedMatches.events.length,
      entities: groupedMatches.entities.length,
      questions: groupedMatches.questions.length,
      signals: groupedMatches.signals.length,
      documents: groupedMatches.documents.length,
    },
  }
}

export function getSuggestions(
  partial: string,
  allNodes: IntelligenceGraphNode[] = [],
): IntelligenceGraphNode[] {
  if (partial.length < 2) return []
  const norm = normalizeText(partial)
  const tokens = tokenize(partial)

  return allNodes
    .filter(n => {
      const label = normalizeText(n.label)
      const subtitle = normalizeText(n.subtitle ?? '')
      if (label.includes(norm) || subtitle.includes(norm)) return true
      if (tokens.length === 0) return false
      return tokens.some(t => wordBoundaryMatch(label, t) || wordBoundaryMatch(subtitle, t))
    })
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 8)
}
