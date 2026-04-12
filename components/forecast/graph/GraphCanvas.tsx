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
import type { IntelligenceGraphNode, IntelligenceGraphEdge } from '@/lib/graph/types'
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

function layoutNodes(
  nodes: IntelligenceGraphNode[],
  edges: IntelligenceGraphEdge[],
  anchorIds: Set<string>,
): Node[] {
  const adjacency = new Map<string, string[]>()
  for (const e of edges) {
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target])
    adjacency.set(e.target, [...(adjacency.get(e.target) ?? []), e.source])
  }

  const positioned = new Map<string, { x: number; y: number }>()
  const anchors = nodes.filter(n => anchorIds.has(n.id))
  const others = nodes.filter(n => !anchorIds.has(n.id))

  const angleStep = (2 * Math.PI) / Math.max(anchors.length, 1)
  const anchorRadius = Math.max(300, anchors.length * 60)
  anchors.forEach((n, i) => {
    const angle = angleStep * i - Math.PI / 2
    positioned.set(n.id, {
      x: Math.cos(angle) * anchorRadius,
      y: Math.sin(angle) * anchorRadius,
    })
  })

  for (const n of others) {
    const neighbors = adjacency.get(n.id) ?? []
    const positionedNeighbors = neighbors
      .map(id => positioned.get(id))
      .filter(Boolean) as { x: number; y: number }[]

    if (positionedNeighbors.length > 0) {
      const cx = positionedNeighbors.reduce((s, p) => s + p.x, 0) / positionedNeighbors.length
      const cy = positionedNeighbors.reduce((s, p) => s + p.y, 0) / positionedNeighbors.length
      const jitter = () => (Math.random() - 0.5) * 180
      positioned.set(n.id, { x: cx + jitter(), y: cy + jitter() })
    } else {
      positioned.set(n.id, {
        x: (Math.random() - 0.5) * 900,
        y: (Math.random() - 0.5) * 900,
      })
    }
  }

  return nodes.map(n => {
    const pos = positioned.get(n.id) ?? { x: 0, y: 0 }
    return {
      id: n.id,
      type: 'intel',
      position: pos,
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
      fitView: () => fitView({ padding: 0.2, duration: 400 }),
    }), [zoomIn, zoomOut, fitView])

    useEffect(() => {
      if (prevNodesRef.current !== graphNodes) {
        setNodes(layoutNodes(graphNodes, graphEdges, anchorSet))
        setEdges(toFlowEdges(graphEdges, nodeIdSet))
        prevNodesRef.current = graphNodes
        setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 100)
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
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
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
