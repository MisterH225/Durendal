'use client'

import type { IntelligenceGraphNode } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG } from '@/lib/graph/types'

interface TimelinePanelProps {
  nodes: IntelligenceGraphNode[]
  selectedNodeId: string | null
  onNodeSelect: (id: string) => void
}

export function TimelinePanel({ nodes, selectedNodeId, onNodeSelect }: TimelinePanelProps) {
  const dated = nodes
    .filter(n => n.createdAt)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  const grouped = new Map<string, IntelligenceGraphNode[]>()
  for (const n of dated) {
    const month = n.createdAt!.slice(0, 7)
    const arr = grouped.get(month) ?? []
    arr.push(n)
    grouped.set(month, arr)
  }

  if (dated.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600 text-xs">
        Aucun nœud avec date dans les résultats
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      {Array.from(grouped.entries()).map(([month, items]) => (
        <div key={month}>
          <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2 sticky top-0 bg-neutral-950 py-1">{month}</div>
          <div className="space-y-1 border-l border-neutral-800 ml-2 pl-3">
            {items.map(n => {
              const cfg = NODE_TYPE_CONFIG[n.type]
              return (
                <button
                  key={n.id}
                  onClick={() => onNodeSelect(n.id)}
                  className={`w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors relative ${
                    selectedNodeId === n.id
                      ? 'bg-blue-500/15 border border-blue-500/30'
                      : 'hover:bg-neutral-800/50 border border-transparent'
                  }`}
                >
                  <div className="absolute -left-[19px] top-3 w-2 h-2 rounded-full border-2 border-neutral-700 bg-neutral-900" />
                  <span className="text-xs mt-0.5">{cfg.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-neutral-200 line-clamp-1">{n.label}</div>
                    <div className="text-[9px] text-neutral-500 mt-0.5 flex items-center gap-2">
                      <span>{n.createdAt}</span>
                      <span className={cfg.textClass}>{cfg.label}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
