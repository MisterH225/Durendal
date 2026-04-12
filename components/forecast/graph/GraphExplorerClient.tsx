'use client'

import { useState, useCallback, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react'

import type {
  GraphSearchResult,
  GraphFilters,
  IntelligenceGraphNode,
} from '@/lib/graph/types'
import { DEFAULT_FILTERS, NODE_TYPE_CONFIG } from '@/lib/graph/types'

import { GraphSearchBar } from './GraphSearchBar'
import { GraphCanvas } from './GraphCanvas'
import { GraphDetailPanel } from './GraphDetailPanel'
import { GraphFiltersPanel } from './GraphFiltersPanel'
import { GraphResultsPanel } from './GraphResultsPanel'
import { GraphToolbar, type ViewMode } from './GraphToolbar'
import { NodeLegend } from './NodeLegend'
import { TimelinePanel } from './TimelinePanel'

export function GraphExplorerClient() {
  return (
    <ReactFlowProvider>
      <GraphExplorerInner />
    </ReactFlowProvider>
  )
}

function GraphExplorerInner() {
  const [result, setResult] = useState<GraphSearchResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [showLeftPanel, setShowLeftPanel] = useState(true)

  const canvasRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fitView: () => void }>(null)

  const selectedNode = result?.nodes.find(n => n.id === selectedNodeId) ?? null

  const performSearch = useCallback(async (query: string, f?: GraphFilters) => {
    setIsLoading(true)
    setSelectedNodeId(null)
    const activeFilters = f ?? filters
    try {
      const params = new URLSearchParams({ q: query })
      if (activeFilters.nodeTypes.length < 10) {
        params.set('nodeTypes', activeFilters.nodeTypes.join(','))
      }
      if (activeFilters.dateRange.from) params.set('from', activeFilters.dateRange.from)
      if (activeFilters.dateRange.to) params.set('to', activeFilters.dateRange.to)
      if (activeFilters.minConfidence > 0) params.set('minConfidence', String(activeFilters.minConfidence))

      const res = await fetch(`/api/forecast/graph/search?${params}`)
      const data: GraphSearchResult = await res.json()
      setResult(data)
    } catch (err) {
      console.error('[GraphExplorer] search error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  const onSearch = useCallback((query: string) => {
    performSearch(query)
  }, [performSearch])

  const onFiltersChange = useCallback((f: GraphFilters) => {
    setFilters(f)
    if (result?.query) performSearch(result.query, f)
  }, [result?.query, performSearch])

  const onNodeSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id)
  }, [])

  const onRecenter = useCallback((nodeId: string) => {
    const node = result?.nodes.find(n => n.id === nodeId)
    if (node) {
      performSearch(node.label)
    }
  }, [result, performSearch])

  const onNodeDoubleClick = useCallback((nodeId: string) => {
    onRecenter(nodeId)
  }, [onRecenter])

  const activeTypes = [...new Set(result?.nodes.map(n => n.type) ?? [])]

  return (
    <div className="h-full flex flex-col bg-neutral-950">
      {/* Top bar */}
      <div className="flex-shrink-0 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            title={showLeftPanel ? 'Masquer panneau' : 'Afficher panneau'}
          >
            {showLeftPanel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>

          <div className="flex-1 flex items-center justify-center">
            <GraphSearchBar onSearch={onSearch} isLoading={isLoading} />
          </div>
        </div>

        {result && (
          <div className="flex items-center justify-between px-4 pb-2">
            <GraphToolbar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              nodeCount={result.nodes.length}
              edgeCount={result.edges.length}
              onZoomIn={() => canvasRef.current?.zoomIn()}
              onZoomOut={() => canvasRef.current?.zoomOut()}
              onFitView={() => canvasRef.current?.fitView()}
            />
            <NodeLegend activeTypes={activeTypes} />
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: filters + results */}
        {showLeftPanel && result && (
          <div className="w-[280px] flex-shrink-0 border-r border-neutral-800 bg-neutral-900/50 overflow-y-auto">
            <div className="p-3 border-b border-neutral-800">
              <GraphFiltersPanel filters={filters} onChange={onFiltersChange} />
            </div>
            <div className="p-3">
              <GraphResultsPanel
                result={result}
                selectedNodeId={selectedNodeId}
                onNodeSelect={onNodeSelect}
              />
            </div>
          </div>
        )}

        {/* Center: graph / list / timeline */}
        <div className="flex-1 relative">
          {viewMode === 'graph' && (
            <GraphCanvas
              ref={canvasRef}
              graphNodes={result?.nodes ?? []}
              graphEdges={result?.edges ?? []}
              anchorNodeIds={result?.anchorNodeIds ?? []}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              onNodeDoubleClick={onNodeDoubleClick}
            />
          )}

          {viewMode === 'list' && result && (
            <div className="h-full overflow-y-auto p-4">
              <ListView nodes={result.nodes} selectedNodeId={selectedNodeId} onNodeSelect={onNodeSelect} />
            </div>
          )}

          {viewMode === 'timeline' && result && (
            <div className="h-full overflow-y-auto">
              <TimelinePanel nodes={result.nodes} selectedNodeId={selectedNodeId} onNodeSelect={onNodeSelect} />
            </div>
          )}
        </div>

        {/* Right: detail panel */}
        {selectedNode && result && (
          <GraphDetailPanel
            node={selectedNode}
            edges={result.edges}
            allNodes={result.nodes}
            onClose={() => setSelectedNodeId(null)}
            onRecenter={onRecenter}
            onNavigate={onNodeSelect}
          />
        )}
      </div>
    </div>
  )
}

function ListView({
  nodes,
  selectedNodeId,
  onNodeSelect,
}: {
  nodes: IntelligenceGraphNode[]
  selectedNodeId: string | null
  onNodeSelect: (id: string) => void
}) {
  const sorted = [...nodes].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))

  return (
    <div className="max-w-3xl mx-auto space-y-1">
      {sorted.map(n => {
        const cfg = NODE_TYPE_CONFIG[n.type]
        return (
          <button
            key={n.id}
            onClick={() => onNodeSelect(n.id)}
            className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
              selectedNodeId === n.id
                ? 'bg-blue-500/10 border border-blue-500/30'
                : 'hover:bg-neutral-900 border border-transparent'
            }`}
          >
            <span className="text-base mt-0.5">{cfg.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-neutral-200">{n.label}</div>
              {n.summary && <div className="text-[11px] text-neutral-400 mt-0.5 line-clamp-2">{n.summary}</div>}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[9px] font-semibold uppercase ${cfg.textClass}`}>{cfg.label}</span>
                {n.createdAt && <span className="text-[9px] text-neutral-600">{n.createdAt}</span>}
                {n.probability != null && (
                  <span className="text-[9px] font-bold text-violet-400">{Math.round(n.probability * 100)}%</span>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
