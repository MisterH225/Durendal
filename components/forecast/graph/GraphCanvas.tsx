'use client'

import { useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { IntelNode, type IntelNodeData } from './IntelNode'
import type { IntelligenceGraphNode, IntelligenceGraphEdge, GraphNodeType, StorylineCard, StorylineEdge, TemporalPosition } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG, EDGE_TYPE_CONFIG } from '@/lib/graph/types'

const nodeTypes: NodeTypes = {
  intel: IntelNode as any,
}

export interface GraphCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  fitView: () => void
}

interface GraphCanvasProps {
  graphNodes: IntelligenceGraphNode[]
  graphEdges: IntelligenceGraphEdge[]
  anchorNodeIds: string[]
  selectedNodeId: string | null
  onNodeSelect: (nodeId: string | null) => void
  onNodeDoubleClick: (nodeId: string) => void
  storylineCards?: StorylineCard[]
  storylineEdges?: StorylineEdge[]
  isStorylineMode?: boolean
}

const NODE_WIDTH: Record<string, number> = { lg: 260, md: 220, sm: 200 }
const NODE_HEIGHT = 80
const MIN_SPACING_X = 40
const MIN_SPACING_Y = 30

function getNodeDimensions(type: GraphNodeType): { w: number; h: number } {
  const size = NODE_TYPE_CONFIG[type]?.size ?? 'sm'
  return { w: NODE_WIDTH[size], h: NODE_HEIGHT }
}

function resolveCollisions(positions: Map<string, { x: number; y: number; w: number; h: number }>, iterations = 30) {
  const entries = Array.from(positions.entries())
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [, a] = entries[i]
        const [, b] = entries[j]
        const overlapX = (a.w / 2 + b.w / 2 + MIN_SPACING_X) - Math.abs(a.x - b.x)
        const overlapY = (a.h / 2 + b.h / 2 + MIN_SPACING_Y) - Math.abs(a.y - b.y)
        if (overlapX > 0 && overlapY > 0) {
          const pushX = overlapX / 2 + 5
          const pushY = overlapY / 2 + 5
          if (overlapX < overlapY) {
            const dir = a.x < b.x ? -1 : 1
            a.x += dir * pushX
            b.x -= dir * pushX
          } else {
            const dir = a.y < b.y ? -1 : 1
            a.y += dir * pushY
            b.y -= dir * pushY
          }
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

const POSITION_X: Record<TemporalPosition, number> = {
  deep_past: -1200,
  past: -800,
  recent: -400,
  anchor: 0,
  concurrent: 100,
  consequence: 500,
  future: 900,
}

function layoutStorylineCards(cards: StorylineCard[]): Node[] {
  if (cards.length === 0) return []

  const positions = new Map<string, { x: number; y: number; w: number; h: number }>()
  const columnCounts: Record<string, number> = {}

  const sortedCards = [...cards].sort((a, b) => a.sortOrder - b.sortOrder)

  for (const card of sortedCards) {
    const tp = card.temporalPosition
    const colKey = tp
    columnCounts[colKey] = (columnCounts[colKey] ?? 0)
    const rowInColumn = columnCounts[colKey]
    columnCounts[colKey]++

    const nodeType = cardTypeToNodeType(card.cardType)
    const dim = getNodeDimensions(nodeType)

    const baseX = POSITION_X[tp] ?? 0
    const yOffset = rowInColumn * (dim.h + MIN_SPACING_Y + 20)
    const yCenter = yOffset - (((columnCounts[colKey] ?? 1) - 1) * (dim.h + MIN_SPACING_Y + 20)) / 2

    positions.set(card.id, {
      x: baseX + (Math.random() - 0.5) * 40,
      y: yCenter,
      w: dim.w,
      h: dim.h,
    })
  }

  resolveCollisions(positions)

  return sortedCards.map(card => {
    const pos = positions.get(card.id) ?? { x: 0, y: 0 }
    const nodeType = cardTypeToNodeType(card.cardType)
    const isAnchor = card.temporalPosition === 'anchor'

    return {
      id: card.id,
      type: 'intel',
      position: { x: pos.x, y: pos.y },
      data: {
        id: card.id,
        type: nodeType,
        label: card.title,
        subtitle: card.date ?? undefined,
        summary: card.summary ?? undefined,
        probability: card.probability ?? undefined,
        importance: card.importance,
        createdAt: card.date ?? undefined,
        regionTags: card.regionTags,
        sectorTags: card.sectorTags,
        isAnchor,
        isSelected: false,
        dimmed: false,
        metadata: {
          temporalPosition: card.temporalPosition,
          confidence: card.confidence,
          probabilitySource: card.probabilitySource,
          supportingEvidence: card.supportingEvidence,
          contradictingEvidence: card.contradictingEvidence,
          outcomeStatus: card.outcomeStatus,
        },
      } as Record<string, unknown>,
    }
  }) as Node[]
}

function storylineEdgesToFlow(stEdges: StorylineEdge[], cardIds: Set<string>): Edge[] {
  const seen = new Set<string>()

  return stEdges
    .filter(e => cardIds.has(e.sourceCardId) && cardIds.has(e.targetCardId))
    .filter(e => {
      if (e.relationCategory === 'temporal') {
        const pairKey = `${e.sourceCardId}-${e.targetCardId}`
        const hasSemantic = stEdges.some(
          other => other.id !== e.id &&
            other.sourceCardId === e.sourceCardId &&
            other.targetCardId === e.targetCardId &&
            other.relationCategory !== 'temporal',
        )
        if (hasSemantic) return false
        if (seen.has(pairKey)) return false
        seen.add(pairKey)
      }
      return true
    })
    .map(e => {
      const subtype = e.relationSubtype as string
      const config = EDGE_TYPE_CONFIG[subtype]
      const category = e.relationCategory

      const strokeWidth = config?.strokeWidth
        ?? (category === 'causal' ? 3 : category === 'corollary' ? 2 : 1)
      const isDashed = config?.dash
        ?? (category === 'temporal' || category === 'contextual')

      return {
        id: e.id,
        source: e.sourceCardId,
        target: e.targetCardId,
        label: config?.label ?? subtype,
        style: {
          stroke: config?.color ?? (category === 'causal' ? '#dc2626' : category === 'corollary' ? '#7c3aed' : category === 'outcome' ? '#14b8a6' : '#9ca3af'),
          strokeWidth,
          strokeDasharray: isDashed ? '6 3' : undefined,
        },
        labelStyle: { fontSize: 10, fill: category === 'causal' ? '#fca5a5' : '#9ca3af', fontWeight: category === 'causal' ? 600 : 400 },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.9 },
        animated: category === 'outcome',
        data: e as unknown as Record<string, unknown>,
      } as Edge
    })
}

function cardTypeToNodeType(cardType: string): GraphNodeType {
  const map: Record<string, GraphNodeType> = {
    event: 'event',
    article: 'article',
    signal: 'signal',
    entity: 'entity',
    outcome: 'outcome',
    context: 'context',
  }
  return map[cardType] ?? 'article'
}

function layoutGraphNodes(
  nodes: IntelligenceGraphNode[],
  edges: IntelligenceGraphEdge[],
  anchorIds: Set<string>,
): Node[] {
  if (nodes.length === 0) return []

  const adjacency = new Map<string, Set<string>>()
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set())
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set())
    adjacency.get(e.source)!.add(e.target)
    adjacency.get(e.target)!.add(e.source)
  }

  const positions = new Map<string, { x: number; y: number; w: number; h: number }>()
  const anchors = nodes.filter(n => anchorIds.has(n.id))
  const nonAnchors = nodes.filter(n => !anchorIds.has(n.id))

  const anchorRadius = Math.max(450, anchors.length * 100)
  const angleStep = (2 * Math.PI) / Math.max(anchors.length, 1)
  anchors.forEach((n, i) => {
    const angle = angleStep * i - Math.PI / 2
    const dim = getNodeDimensions(n.type)
    positions.set(n.id, {
      x: Math.cos(angle) * anchorRadius,
      y: Math.sin(angle) * anchorRadius,
      w: dim.w, h: dim.h,
    })
  })

  const layers: IntelligenceGraphNode[][] = [[], [], []]
  for (const n of nonAnchors) {
    const neighbors = adjacency.get(n.id)
    const hasAnchorNeighbor = neighbors && Array.from(neighbors).some(id => anchorIds.has(id))
    if (hasAnchorNeighbor) layers[0].push(n)
    else if (neighbors && neighbors.size > 0) layers[1].push(n)
    else layers[2].push(n)
  }

  const ringRadii = [180, 320, 480]
  for (let layer = 0; layer < layers.length; layer++) {
    for (const n of layers[layer]) {
      const dim = getNodeDimensions(n.type)
      const neighbors = adjacency.get(n.id) ?? new Set()
      const positionedNeighbors = Array.from(neighbors)
        .map(id => positions.get(id))
        .filter(Boolean) as { x: number; y: number }[]

      if (positionedNeighbors.length > 0) {
        const cx = positionedNeighbors.reduce((s, p) => s + p.x, 0) / positionedNeighbors.length
        const cy = positionedNeighbors.reduce((s, p) => s + p.y, 0) / positionedNeighbors.length
        const angle = Math.atan2(cy, cx) + (Math.random() - 0.5) * 1.2
        const r = ringRadii[layer] + (Math.random() - 0.5) * 80
        positions.set(n.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, w: dim.w, h: dim.h })
      } else {
        const angle = Math.random() * Math.PI * 2
        const r = anchorRadius + ringRadii[layer]
        positions.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, w: dim.w, h: dim.h })
      }
    }
  }

  resolveCollisions(positions)

  return nodes.map(n => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 }
    return {
      id: n.id,
      type: 'intel',
      position: { x: pos.x, y: pos.y },
      data: { ...n, isAnchor: anchorIds.has(n.id) } as unknown as Record<string, unknown>,
    } as Node
  })
}

function graphEdgesToFlow(gEdges: IntelligenceGraphEdge[], nodeIds: Set<string>): Edge[] {
  return gEdges
    .filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map(e => {
      const config = EDGE_TYPE_CONFIG[e.type]
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: config?.label,
        style: {
          stroke: config?.color ?? '#6b7280',
          strokeWidth: Math.max(1, (e.confidence ?? 0.5) * 2.5),
          strokeDasharray: config?.dash ? '6 3' : undefined,
        },
        labelStyle: { fontSize: 9, fill: '#9ca3af' },
        labelBgStyle: { fill: '#171717', fillOpacity: 0.9 },
        animated: e.type === 'raises_probability_of' || e.type === 'lowers_probability_of',
        data: e as unknown as Record<string, unknown>,
      } as Edge
    })
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvasInner(
    { graphNodes, graphEdges, anchorNodeIds, selectedNodeId, onNodeSelect, onNodeDoubleClick, storylineCards, storylineEdges, isStorylineMode },
    ref,
  ) {
    const anchorSet = useMemo(() => new Set(anchorNodeIds), [anchorNodeIds])
    const nodeIdSet = useMemo(() => new Set(graphNodes.map(n => n.id)), [graphNodes])

    const useStoryline = isStorylineMode && storylineCards && storylineCards.length > 0

    const initialNodes = useMemo(() => {
      if (useStoryline) return layoutStorylineCards(storylineCards!)
      return layoutGraphNodes(graphNodes, graphEdges, anchorSet)
    }, [useStoryline, storylineCards, graphNodes, graphEdges, anchorSet])

    const initialEdges = useMemo(() => {
      if (useStoryline && storylineEdges) {
        const cardIds = new Set(storylineCards!.map(c => c.id))
        return storylineEdgesToFlow(storylineEdges, cardIds)
      }
      return graphEdgesToFlow(graphEdges, nodeIdSet)
    }, [useStoryline, storylineEdges, storylineCards, graphEdges, nodeIdSet])

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const { fitView, zoomIn, zoomOut } = useReactFlow()
    const prevDataRef = useRef({ graphNodes, storylineCards })

    useImperativeHandle(ref, () => ({
      zoomIn: () => zoomIn({ duration: 200 }),
      zoomOut: () => zoomOut({ duration: 200 }),
      fitView: () => fitView({ padding: 0.15, duration: 400 }),
    }), [zoomIn, zoomOut, fitView])

    useEffect(() => {
      const changed = prevDataRef.current.graphNodes !== graphNodes || prevDataRef.current.storylineCards !== storylineCards
      if (changed) {
        if (useStoryline) {
          setNodes(layoutStorylineCards(storylineCards!))
          const cardIds = new Set(storylineCards!.map(c => c.id))
          setEdges(storylineEdgesToFlow(storylineEdges ?? [], cardIds))
        } else {
          setNodes(layoutGraphNodes(graphNodes, graphEdges, anchorSet))
          setEdges(graphEdgesToFlow(graphEdges, nodeIdSet))
        }
        prevDataRef.current = { graphNodes, storylineCards }
        setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100)
      }
    }, [graphNodes, graphEdges, anchorSet, nodeIdSet, storylineCards, storylineEdges, useStoryline, setNodes, setEdges, fitView])

    useEffect(() => {
      setNodes(nds =>
        nds.map(n => {
          const d = n.data as unknown as IntelNodeData
          return {
            ...n,
            data: {
              ...n.data,
              isSelected: n.id === selectedNodeId,
              dimmed: selectedNodeId
                ? n.id !== selectedNodeId && !d.isAnchor
                : false,
            },
          }
        }),
      )
    }, [selectedNodeId, setNodes])

    const onNodeClick = useCallback(
      (_: React.MouseEvent, node: Node) => onNodeSelect(node.id),
      [onNodeSelect],
    )
    const handleDoubleClick = useCallback(
      (_: React.MouseEvent, node: Node) => onNodeDoubleClick(node.id),
      [onNodeDoubleClick],
    )
    const onPaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect])

    const hasContent = useStoryline ? storylineCards!.length > 0 : graphNodes.length > 0

    if (!hasContent) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-base font-bold text-neutral-200 mb-2">Storyline Intelligence Explorer</h3>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Recherchez un sujet ou collez un lien d'article pour construire une storyline intelligence
              qui retrace les causes, le contexte et les projections d'un événement.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['Iran', 'cacao', 'Niger', 'inflation', 'IA', 'crypto'].map(tag => (
                <span key={tag} className="text-[10px] px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      )
    }

    return (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={handleDoubleClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.03}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-neutral-950"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
        <MiniMap
          nodeColor={node => {
            const d = node.data as unknown as IntelNodeData
            return NODE_TYPE_CONFIG[d.type]?.color ?? '#6b7280'
          }}
          maskColor="rgba(0,0,0,0.8)"
          className="!bg-neutral-900 !border-neutral-800 rounded-lg"
          pannable
          zoomable
        />
      </ReactFlow>
    )
  },
)
