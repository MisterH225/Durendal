import type {
  IntelligenceGraphNode, IntelligenceGraphEdge,
  GraphSearchResult, GraphFilters, GraphNodeType,
} from './types'
import { MOCK_NODES, MOCK_EDGES } from './mock-data'

// ============================================================================
// Intelligence Graph Search Engine
// Keyword → scored nodes → neighborhood expansion → pruned subgraph
// ============================================================================

const MAX_ANCHOR_NODES = 8
const MAX_NEIGHBORHOOD_DEPTH = 2
const MAX_TOTAL_NODES = 60

interface ScoredNode {
  node: IntelligenceGraphNode
  score: number
  matchType: 'exact' | 'partial' | 'tag' | 'entity' | 'semantic'
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, "'")
    .trim()
}

function tokenize(query: string): string[] {
  return normalizeText(query)
    .split(/\s+/)
    .filter(t => t.length > 1)
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
  const haystack = `${label} ${summary} ${subtitle} ${regions} ${sectors}`

  let score = 0
  let matchType: ScoredNode['matchType'] = 'partial'

  if (label === normalizedQuery) {
    score += 100
    matchType = 'exact'
  } else if (label.includes(normalizedQuery)) {
    score += 60
    matchType = 'partial'
  }

  for (const token of tokens) {
    if (label.includes(token)) score += 30
    if (summary.includes(token)) score += 15
    if (subtitle.includes(token)) score += 20
    if (regions.includes(token)) score += 25
    if (sectors.includes(token)) score += 20
  }

  const importanceBoost = (node.importance ?? 5) * 2
  score += importanceBoost

  const typeWeight: Partial<Record<GraphNodeType, number>> = {
    event: 15,
    question: 12,
    entity: 10,
    article: 5,
    signal: 5,
  }
  score += typeWeight[node.type] ?? 3

  if (score <= importanceBoost + (typeWeight[node.type] ?? 3)) return null

  if (!matchType || matchType === 'partial') {
    if (regions.includes(normalizedQuery) || sectors.includes(normalizedQuery)) matchType = 'tag'
    if (subtitle.includes(normalizedQuery)) matchType = 'entity'
  }

  return { node, score, matchType }
}

function expandNeighborhood(
  anchorIds: Set<string>,
  allEdges: IntelligenceGraphEdge[],
  allNodesMap: Map<string, IntelligenceGraphNode>,
  depth: number,
  filters: GraphFilters,
): { nodes: Map<string, IntelligenceGraphNode>; edges: IntelligenceGraphEdge[] } {
  const resultNodes = new Map<string, IntelligenceGraphNode>()
  const resultEdges: IntelligenceGraphEdge[] = []
  const edgeSet = new Set<string>()
  let frontier = new Set(anchorIds)

  for (const id of anchorIds) {
    const node = allNodesMap.get(id)
    if (node) resultNodes.set(id, node)
  }

  for (let d = 0; d < depth; d++) {
    const nextFrontier = new Set<string>()
    for (const edge of allEdges) {
      if (edgeSet.has(edge.id)) continue
      if (filters.minConfidence > 0 && (edge.confidence ?? 1) < filters.minConfidence) continue
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

export function searchGraph(
  query: string,
  filters: GraphFilters,
  allNodes: IntelligenceGraphNode[] = MOCK_NODES,
  allEdges: IntelligenceGraphEdge[] = MOCK_EDGES,
): GraphSearchResult {
  const normalizedQuery = normalizeText(query)
  const tokens = tokenize(query)

  if (tokens.length === 0) {
    return {
      query,
      nodes: [],
      edges: [],
      anchorNodeIds: [],
      groupedMatches: { articles: [], events: [], entities: [], questions: [], signals: [], documents: [] },
      totals: { articles: 0, events: 0, entities: 0, questions: 0, signals: 0, documents: 0 },
    }
  }

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

  scored.sort((a, b) => b.score - a.score)

  const anchors = scored.slice(0, MAX_ANCHOR_NODES)
  const anchorIds = new Set(anchors.map(a => a.node.id))
  const nodesMap = new Map(allNodes.map(n => [n.id, n]))

  const { nodes: subgraphNodes, edges: subgraphEdges } = expandNeighborhood(
    anchorIds,
    allEdges,
    nodesMap,
    MAX_NEIGHBORHOOD_DEPTH,
    filters,
  )

  const nodeArray = Array.from(subgraphNodes.values())
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
    nodes: nodeArray,
    edges: subgraphEdges,
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

export function getSuggestions(partial: string): IntelligenceGraphNode[] {
  if (partial.length < 2) return []
  const norm = normalizeText(partial)
  const tokens = tokenize(partial)

  return MOCK_NODES
    .filter(n => {
      const label = normalizeText(n.label)
      const tags = [...(n.regionTags ?? []), ...(n.sectorTags ?? [])].map(normalizeText).join(' ')
      return label.includes(norm) || tokens.some(t => label.includes(t) || tags.includes(t))
    })
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 8)
}
