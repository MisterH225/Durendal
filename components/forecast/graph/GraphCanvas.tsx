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
import type { IntelligenceGraphNode, IntelligenceGraphEdge, GraphNodeType } from '@/lib/graph/types'
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
}

const NODE_WIDTH: Record<string, number> = { lg: 220, md: 180, sm: 160 }
const NODE_HEIGHT = 70
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

function layoutNodes(
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
    const hasAnchorNeighbor = neighbors && [...neighbors].some(id => anchorIds.has(id))
    if (hasAnchorNeighbor) layers[0].push(n)
    else if (neighbors && neighbors.size > 0) layers[1].push(n)
    else layers[2].push(n)
  }

  const ringRadii = [180, 320, 480]

  for (let layer = 0; layer < layers.length; layer++) {
    const group = layers[layer]
    for (const n of group) {
      const dim = getNodeDimensions(n.type)
      const neighbors = adjacency.get(n.id) ?? new Set()
      const positionedNeighbors = [...neighbors]
        .map(id => positions.get(id))
        .filter(Boolean) as { x: number; y: number }[]

      if (positionedNeighbors.length > 0) {
        const cx = positionedNeighbors.reduce((s, p) => s + p.x, 0) / positionedNeighbors.length
        const cy = positionedNeighbors.reduce((s, p) => s + p.y, 0) / positionedNeighbors.length
        const angle = Math.atan2(cy, cx) + (Math.random() - 0.5) * 1.2
        const r = ringRadii[layer] + (Math.random() - 0.5) * 80
        positions.set(n.id, {
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          w: dim.w, h: dim.h,
        })
      } else {
        const angle = Math.random() * Math.PI * 2
        const r = anchorRadius + ringRadii[layer]
        positions.set(n.id, {
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          w: dim.w, h: dim.h,
        })
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
      data: { ...n, isAnchor: anchorIds.has(n.id) } as IntelNodeData,
    }
  })
}

function toFlowEdges(
  edges: IntelligenceGraphEdge[],
  nodeIds: Set<string>,
): Edge[] {
  return edges
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
        data: e,
      }
    })
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvasInner(
    { graphNodes, graphEdges, anchorNodeIds, selectedNodeId, onNodeSelect, onNodeDoubleClick },
    ref,
  ) {
    const anchorSet = useMemo(() => new Set(anchorNodeIds), [anchorNodeIds])
    const nodeIdSet = useMemo(() => new Set(graphNodes.map(n => n.id)), [graphNodes])

    const initialNodes = useMemo(
      () => layoutNodes(graphNodes, graphEdges, anchorSet),
      [graphNodes, graphEdges, anchorSet],
    )
    const initialEdges = useMemo(
      () => toFlowEdges(graphEdges, nodeIdSet),
      [graphEdges, nodeIdSet],
    )

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const { fitView, zoomIn, zoomOut } = useReactFlow()
    const prevNodesRef = useRef(graphNodes)

    useImperativeHandle(ref, () => ({
      zoomIn: () => zoomIn({ duration: 200 }),
      zoomOut: () => zoomOut({ duration: 200 }),
      fitView: () => fitView({ padding: 0.15, duration: 400 }),
    }), [zoomIn, zoomOut, fitView])

    useEffect(() => {
      if (prevNodesRef.current !== graphNodes) {
        setNodes(layoutNodes(graphNodes, graphEdges, anchorSet))
        setEdges(toFlowEdges(graphEdges, nodeIdSet))
        prevNodesRef.current = graphNodes
        setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100)
      }
    }, [graphNodes, graphEdges, anchorSet, nodeIdSet, setNodes, setEdges, fitView])

    useEffect(() => {
      setNodes(nds =>
        nds.map(n => ({
          ...n,
          data: {
            ...(n.data as IntelNodeData),
            isSelected: n.id === selectedNodeId,
            dimmed: selectedNodeId
              ? n.id !== selectedNodeId && !anchorSet.has(n.id)
              : false,
          },
        })),
      )
    }, [selectedNodeId, anchorSet, setNodes])

    const onNodeClick = useCallback(
      (_: React.MouseEvent, node: Node) => onNodeSelect(node.id),
      [onNodeSelect],
    )

    const handleDoubleClick = useCallback(
      (_: React.MouseEvent, node: Node) => onNodeDoubleClick(node.id),
      [onNodeDoubleClick],
    )

    const onPaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect])

    if (graphNodes.length === 0) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-base font-bold text-neutral-200 mb-2">Intelligence Graph Explorer</h3>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Recherchez un sujet — Iran, cacao, Niger, inflation, IA — pour explorer
              le graphe de connexions intelligence et naviguer entre événements,
              signaux, entités et questions.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {['Iran', 'cacao', 'Niger', 'inflation', 'IA', 'CEDEAO'].map(tag => (
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
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-neutral-950"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333" />
        <MiniMap
          nodeColor={node => {
            const d = node.data as IntelNodeData
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
