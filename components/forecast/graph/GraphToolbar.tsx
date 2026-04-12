'use client'

import { ZoomIn, ZoomOut, Maximize, Network, List, Clock } from 'lucide-react'

export type ViewMode = 'graph' | 'list' | 'timeline'

interface GraphToolbarProps {
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  nodeCount: number
  edgeCount: number
  onZoomIn?: () => void
  onZoomOut?: () => void
  onFitView?: () => void
}

export function GraphToolbar({
  viewMode,
  onViewModeChange,
  nodeCount,
  edgeCount,
  onZoomIn,
  onZoomOut,
  onFitView,
}: GraphToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-neutral-900 border border-neutral-700 rounded-lg p-0.5">
        {([
          { mode: 'graph' as const, icon: Network, label: 'Graphe' },
          { mode: 'list' as const, icon: List, label: 'Liste' },
          { mode: 'timeline' as const, icon: Clock, label: 'Timeline' },
        ]).map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
              viewMode === mode
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                : 'text-neutral-500 hover:text-neutral-300 border border-transparent'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {viewMode === 'graph' && (
        <div className="flex items-center bg-neutral-900 border border-neutral-700 rounded-lg p-0.5">
          <button onClick={onZoomIn} className="p-1.5 text-neutral-500 hover:text-neutral-300 transition-colors" title="Zoom +">
            <ZoomIn size={14} />
          </button>
          <button onClick={onZoomOut} className="p-1.5 text-neutral-500 hover:text-neutral-300 transition-colors" title="Zoom -">
            <ZoomOut size={14} />
          </button>
          <button onClick={onFitView} className="p-1.5 text-neutral-500 hover:text-neutral-300 transition-colors" title="Ajuster vue">
            <Maximize size={14} />
          </button>
        </div>
      )}

      <span className="text-[9px] text-neutral-600 ml-1">
        {nodeCount} nœuds · {edgeCount} liens
      </span>
    </div>
  )
}
