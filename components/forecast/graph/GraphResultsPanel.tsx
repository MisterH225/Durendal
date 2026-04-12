'use client'

import type { GraphSearchResult, IntelligenceGraphNode } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG } from '@/lib/graph/types'

interface GraphResultsPanelProps {
  result: GraphSearchResult
  selectedNodeId: string | null
  onNodeSelect: (id: string) => void
}

export function GraphResultsPanel({ result, selectedNodeId, onNodeSelect }: GraphResultsPanelProps) {
  const nodesMap = new Map(result.nodes.map(n => [n.id, n]))

  const groups: { key: string; label: string; icon: string; ids: string[] }[] = [
    { key: 'events',   label: 'Événements', icon: '⚡', ids: result.groupedMatches.events },
    { key: 'questions',label: 'Questions',  icon: '❓', ids: result.groupedMatches.questions },
    { key: 'entities', label: 'Entités',    icon: '🏢', ids: result.groupedMatches.entities },
    { key: 'articles', label: 'Articles',   icon: '📄', ids: result.groupedMatches.articles },
    { key: 'signals',  label: 'Signaux',    icon: '📡', ids: result.groupedMatches.signals },
  ].filter(g => g.ids.length > 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(result.totals).map(([key, count]) =>
          count > 0 ? (
            <span key={key} className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
              {key}: <span className="font-bold text-neutral-200">{count}</span>
            </span>
          ) : null
        )}
        <span className="text-[9px] text-neutral-600">
          {result.nodes.length} nœuds · {result.edges.length} liens
        </span>
      </div>

      {groups.map(group => (
        <div key={group.key}>
          <h4 className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <span>{group.icon}</span> {group.label} ({group.ids.length})
          </h4>
          <div className="space-y-0.5">
            {group.ids.map(id => {
              const node = nodesMap.get(id)
              if (!node) return null
              return (
                <button
                  key={id}
                  onClick={() => onNodeSelect(id)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                    selectedNodeId === id
                      ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                      : 'text-neutral-300 hover:bg-neutral-800 border border-transparent'
                  }`}
                >
                  <div className="font-medium truncate">{node.label}</div>
                  {node.summary && (
                    <div className="text-[9px] text-neutral-500 truncate mt-0.5">{node.summary}</div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
