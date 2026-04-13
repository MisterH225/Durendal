'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { PanelLeftOpen, PanelLeftClose, Loader2 } from 'lucide-react'

import type {
  GraphSearchResult,
  GraphFilters,
  IntelligenceGraphNode,
  StorylineResult,
  StorylineCard,
  StorylineEdge,
  StorylineSSEEvent,
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

interface GraphExplorerClientProps {
  initialArticleId?: string
  initialQuery?: string
}

export function GraphExplorerClient({ initialArticleId, initialQuery }: GraphExplorerClientProps = {}) {
  return (
    <ReactFlowProvider>
      <GraphExplorerInner initialArticleId={initialArticleId} initialQuery={initialQuery} />
    </ReactFlowProvider>
  )
}

type BuildPhase = 'idle' | 'internal' | 'external' | 'analysis' | 'outcomes' | 'complete' | 'error'

function GraphExplorerInner({ initialArticleId, initialQuery }: { initialArticleId?: string; initialQuery?: string } = {}) {
  const [storyline, setStoryline] = useState<StorylineResult | null>(null)
  const [cards, setCards] = useState<StorylineCard[]>([])
  const [edges, setEdges] = useState<StorylineEdge[]>([])
  const [narrative, setNarrative] = useState<string>('')
  const [buildPhase, setBuildPhase] = useState<BuildPhase>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_FILTERS)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [currentQuery, setCurrentQuery] = useState('')

  const canvasRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fitView: () => void }>(null)
  const abortRef = useRef<AbortController | null>(null)
  const autoTriggered = useRef(false)

  const legacyResult = useMemo(() => storylineToGraphResult(cards, edges, currentQuery), [cards, edges, currentQuery])
  const selectedNode = legacyResult?.nodes.find(n => n.id === selectedNodeId) ?? null

  const performSearch = useCallback(async (query: string, articleId?: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setBuildPhase('internal')
    setSelectedNodeId(null)
    setCards([])
    setEdges([])
    setNarrative('')
    setStoryline(null)
    setErrorMsg(null)
    setCurrentQuery(query)

    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (articleId) params.set('articleId', articleId)

      const res = await fetch(`/api/forecast/graph/search?${params}`, {
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const json = line.slice(6).trim()
          if (!json) continue

          try {
            const event: StorylineSSEEvent = JSON.parse(json)
            handleSSEEvent(event)
          } catch {
            // malformed JSON line, skip
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      setErrorMsg(msg)
      setBuildPhase('error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  function handleSSEEvent(event: StorylineSSEEvent) {
    setBuildPhase(event.phase as BuildPhase)

    if (event.cards && event.cards.length > 0) {
      setCards(prev => {
        const existingIds = new Set(prev.map(c => c.id))
        const newCards = event.cards!.filter(c => !existingIds.has(c.id))
        return [...prev, ...newCards]
      })
    }

    if (event.edges && event.edges.length > 0) {
      setEdges(prev => {
        const existingIds = new Set(prev.map(e => e.id))
        const newEdges = event.edges!.filter(e => !existingIds.has(e.id))
        return [...prev, ...newEdges]
      })
    }

    if (event.narrative) {
      setNarrative(event.narrative)
    }

    if (event.phase === 'complete' && event.storyline) {
      setStoryline(event.storyline)
      setCards(event.storyline.cards)
      setEdges(event.storyline.edges)
      setNarrative(event.storyline.narrative ?? '')
    }

    if (event.phase === 'error') {
      setErrorMsg(event.error ?? 'Erreur lors de la construction')
    }
  }

  useEffect(() => {
    if (autoTriggered.current) return
    autoTriggered.current = true
    if (initialArticleId) {
      performSearch('', initialArticleId)
    } else if (initialQuery) {
      performSearch(initialQuery)
    }
  }, [initialArticleId, initialQuery, performSearch])

  const onSearch = useCallback((query: string) => {
    performSearch(query)
  }, [performSearch])

  const onFiltersChange = useCallback((f: GraphFilters) => {
    setFilters(f)
  }, [])

  const onNodeSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id)
  }, [])

  const onRecenter = useCallback((nodeId: string) => {
    const card = cards.find(c => c.id === nodeId)
    if (card) performSearch(card.title)
  }, [cards, performSearch])

  const onNodeDoubleClick = useCallback((nodeId: string) => {
    onRecenter(nodeId)
  }, [onRecenter])

  const phaseLabel = PHASE_LABELS[buildPhase] ?? ''
  const activeTypes = Array.from(new Set(legacyResult?.nodes.map(n => n.type) ?? []))
  const hasContent = cards.length > 0

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

        {hasContent && (
          <div className="flex items-center justify-between px-4 pb-2">
            <div className="flex items-center gap-3">
              <GraphToolbar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                nodeCount={cards.length}
                edgeCount={edges.length}
                onZoomIn={() => canvasRef.current?.zoomIn()}
                onZoomOut={() => canvasRef.current?.zoomOut()}
                onFitView={() => canvasRef.current?.fitView()}
              />
              {isLoading && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400">
                  <Loader2 size={12} className="animate-spin" />
                  <span>{phaseLabel}</span>
                </div>
              )}
            </div>
            <NodeLegend activeTypes={activeTypes} />
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        {showLeftPanel && hasContent && (
          <div className="w-[280px] flex-shrink-0 border-r border-neutral-800 bg-neutral-900/50 overflow-y-auto">
            <div className="p-3 border-b border-neutral-800">
              <GraphFiltersPanel filters={filters} onChange={onFiltersChange} />
            </div>
            {narrative && (
              <div className="p-3 border-b border-neutral-800">
                <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">Récit</h4>
                <p className="text-[11px] text-neutral-300 leading-relaxed whitespace-pre-line">{narrative.slice(0, 800)}</p>
                {narrative.length > 800 && (
                  <button onClick={() => setViewMode('timeline')} className="text-[10px] text-blue-400 mt-1 hover:underline">
                    Lire la suite...
                  </button>
                )}
              </div>
            )}
            {legacyResult && (
              <div className="p-3">
                <GraphResultsPanel
                  result={legacyResult}
                  selectedNodeId={selectedNodeId}
                  onNodeSelect={onNodeSelect}
                />
              </div>
            )}
          </div>
        )}

        {/* Center */}
        <div className="flex-1 relative">
          {errorMsg && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-900/80 text-red-200 text-xs px-4 py-2 rounded-lg border border-red-700">
              {errorMsg}
            </div>
          )}

          {viewMode === 'graph' && (
            <GraphCanvas
              ref={canvasRef}
              graphNodes={legacyResult?.nodes ?? []}
              graphEdges={legacyResult?.edges ?? []}
              anchorNodeIds={legacyResult?.anchorNodeIds ?? []}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              onNodeDoubleClick={onNodeDoubleClick}
              storylineCards={cards}
              storylineEdges={edges}
              isStorylineMode={true}
            />
          )}

          {viewMode === 'list' && legacyResult && (
            <div className="h-full overflow-y-auto p-4">
              <ListView nodes={legacyResult.nodes} selectedNodeId={selectedNodeId} onNodeSelect={onNodeSelect} />
            </div>
          )}

          {viewMode === 'timeline' && legacyResult && (
            <div className="h-full overflow-y-auto">
              <TimelinePanel
                nodes={legacyResult.nodes}
                edges={legacyResult.edges}
                query={currentQuery}
                selectedNodeId={selectedNodeId}
                onNodeSelect={onNodeSelect}
                narrative={narrative}
              />
            </div>
          )}
        </div>

        {/* Right detail panel */}
        {selectedNode && legacyResult && (
          <GraphDetailPanel
            node={selectedNode}
            edges={legacyResult.edges}
            allNodes={legacyResult.nodes}
            onClose={() => setSelectedNodeId(null)}
            onRecenter={onRecenter}
            onNavigate={onNodeSelect}
          />
        )}
      </div>
    </div>
  )
}

const PHASE_LABELS: Record<string, string> = {
  internal: 'Recherche données internes...',
  external: 'Recherche internet (multi-fenêtre)...',
  analysis: 'Analyse causale et temporelle...',
  outcomes: 'Génération des projections...',
  complete: '',
  error: 'Erreur',
}

function storylineToGraphResult(
  cards: StorylineCard[],
  edges: StorylineEdge[],
  query: string,
): GraphSearchResult {
  const nodes: IntelligenceGraphNode[] = cards.map(c => ({
    id: c.id,
    type: cardTypeToGraphType(c.cardType),
    label: c.title,
    subtitle: c.date ?? undefined,
    summary: c.summary,
    importance: c.importance,
    createdAt: c.date,
    regionTags: c.regionTags,
    sectorTags: c.sectorTags,
    probability: c.probability,
    url: c.sourceUrls?.[0],
    metadata: { temporalPosition: c.temporalPosition, confidence: c.confidence },
  }))

  const graphEdges = edges.map(e => ({
    id: e.id,
    source: e.sourceCardId,
    target: e.targetCardId,
    type: e.relationType as any,
    confidence: e.confidence,
    explanation: e.explanation,
  }))

  const anchorNodeIds = cards.filter(c => c.temporalPosition === 'anchor').map(c => c.id)

  return {
    query,
    nodes,
    edges: graphEdges,
    anchorNodeIds,
    groupedMatches: {
      articles: cards.filter(c => c.cardType === 'article').map(c => c.id),
      events: cards.filter(c => c.cardType === 'event').map(c => c.id),
      entities: cards.filter(c => c.cardType === 'entity').map(c => c.id),
      questions: [],
      signals: cards.filter(c => c.cardType === 'signal').map(c => c.id),
      documents: [],
    },
    totals: {
      articles: cards.filter(c => c.cardType === 'article').length,
      events: cards.filter(c => c.cardType === 'event').length,
      entities: cards.filter(c => c.cardType === 'entity').length,
      questions: 0,
      signals: cards.filter(c => c.cardType === 'signal').length,
      documents: 0,
    },
  }
}

function cardTypeToGraphType(t: string): IntelligenceGraphNode['type'] {
  const map: Record<string, IntelligenceGraphNode['type']> = {
    event: 'event', article: 'article', signal: 'signal',
    entity: 'entity', outcome: 'outcome', context: 'context',
  }
  return map[t] ?? 'article'
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
        if (!cfg) return null
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
