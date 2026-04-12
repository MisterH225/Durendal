import type {
  IntelligenceGraphNode, IntelligenceGraphEdge,
  GraphSearchResult, GraphFilters, GraphNodeType,
} from './types'
import { MOCK_NODES, MOCK_EDGES } from './mock-data'

// ============================================================================
// Intelligence Graph Search Engine
// Keyword → scored nodes → focused neighborhood → pruned subgraph
// ============================================================================

const MAX_ANCHOR_NODES = 6
const MAX_NEIGHBORHOOD_DEPTH = 1
const MAX_TOTAL_NODES = 35
const MIN_KEYWORD_SCORE = 20

interface ScoredNode {
  node: IntelligenceGraphNode
  keywordScore: number
  totalScore: number
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

  let keywordScore = 0
  let matchType: ScoredNode['matchType'] = 'partial'

  if (label === normalizedQuery) {
    keywordScore += 100
    matchType = 'exact'
  } else if (label.includes(normalizedQuery)) {
    keywordScore += 60
    matchType = 'partial'
  }

  for (const token of tokens) {
    if (label.includes(token)) keywordScore += 30
    if (subtitle.includes(token)) keywordScore += 25
    if (regions.includes(token)) keywordScore += 25
    if (summary.includes(token)) keywordScore += 12
    if (sectors.includes(token)) keywordScore += 10
  }

  if (keywordScore < MIN_KEYWORD_SCORE) return null

  if (regions.includes(normalizedQuery) || sectors.includes(normalizedQuery)) matchType = 'tag'
  if (subtitle.includes(normalizedQuery)) matchType = 'entity'
  if (label === normalizedQuery || label.includes(normalizedQuery)) matchType = keywordScore >= 100 ? 'exact' : 'partial'

  const importanceBoost = (node.importance ?? 5) * 1.5
  const typeWeight: Partial<Record<GraphNodeType, number>> = {
    event: 10, question: 8, entity: 6, article: 3, signal: 3,
  }
  const totalScore = keywordScore + importanceBoost + (typeWeight[node.type] ?? 2)

  return { node, keywordScore, totalScore, matchType }
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

  const structuralEdgeTypes = new Set([
    'belongs_to_region', 'belongs_to_sector',
  ])

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

      if (d > 0 && structuralEdgeTypes.has(edge.type)) continue
      if (d > 0 && (edge.confidence ?? 1) < 0.5) continue

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
  for (const [id, node] of nodes) {
    if (anchorIds.has(id)) { kept.add(id); continue }
    const conns = connectionCount.get(id) ?? 0
    if (conns >= 1) kept.add(id)
  }

  const prunedNodes = Array.from(nodes.values()).filter(n => kept.has(n.id))
  const prunedEdges = edges.filter(e => kept.has(e.source) && kept.has(e.target))
  return { nodes: prunedNodes, edges: prunedEdges }
}

export function searchGraph(
  query: string,
  filters: GraphFilters,
  allNodes: IntelligenceGraphNode[] = MOCK_NODES,
  allEdges: IntelligenceGraphEdge[] = MOCK_EDGES,
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
  const nodesMap = new Map(allNodes.map(n => [n.id, n]))

  const { nodes: subgraphNodes, edges: subgraphEdges } = expandNeighborhood(
    anchorIds,
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

export function getSuggestions(partial: string): IntelligenceGraphNode[] {
  if (partial.length < 2) return []
  const norm = normalizeText(partial)
  const tokens = tokenize(partial)

  return MOCK_NODES
    .filter(n => {
      const label = normalizeText(n.label)
      const subtitle = normalizeText(n.subtitle ?? '')
      const tags = [...(n.regionTags ?? []), ...(n.sectorTags ?? [])].map(normalizeText).join(' ')
      return label.includes(norm) || subtitle.includes(norm) || tokens.some(t => label.includes(t) || tags.includes(t))
    })
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 8)
}
