'use client'

import { X, ExternalLink, Crosshair, Network, Copy, ArrowUpRight, Newspaper } from 'lucide-react'
import type { IntelligenceGraphNode, IntelligenceGraphEdge } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG, EDGE_TYPE_CONFIG } from '@/lib/graph/types'
import { resolveNodeReadTarget } from './read-link'

interface GraphDetailPanelProps {
  node: IntelligenceGraphNode
  edges: IntelligenceGraphEdge[]
  allNodes: IntelligenceGraphNode[]
  onClose: () => void
  onRecenter: (nodeId: string) => void
  onNavigate: (nodeId: string) => void
}

export function GraphDetailPanel({
  node,
  edges,
  allNodes,
  onClose,
  onRecenter,
  onNavigate,
}: GraphDetailPanelProps) {
  const config = NODE_TYPE_CONFIG[node.type]
  const nodesMap = new Map(allNodes.map(n => [n.id, n]))

  const connectedEdges = edges.filter(e => e.source === node.id || e.target === node.id)
  const connectedNodes = connectedEdges.map(e => {
    const neighborId = e.source === node.id ? e.target : e.source
    const neighbor = nodesMap.get(neighborId)
    return { edge: e, neighbor }
  }).filter(c => c.neighbor)

  const groupedConnections = new Map<string, typeof connectedNodes>()
  for (const c of connectedNodes) {
    const key = EDGE_TYPE_CONFIG[c.edge.type]?.label ?? c.edge.type
    const arr = groupedConnections.get(key) ?? []
    arr.push(c)
    groupedConnections.set(key, arr)
  }

  const linkedArticles = connectedNodes.filter(
    c => c.neighbor && (c.neighbor.type === 'article' || c.neighbor.type === 'signal'),
  )

  const isReadableNode =
    node.type === 'article' || node.type === 'signal' || node.type === 'event'
  const readTarget = resolveNodeReadTarget(node)

  return (
    <div className="w-[340px] flex-shrink-0 bg-neutral-900 border-l border-neutral-800 overflow-y-auto">
      <div className="sticky top-0 bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.textClass}`}>{config.label}</span>
        </div>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-neutral-100 leading-snug">{node.label}</h3>
          {node.subtitle && <p className="text-xs text-neutral-400 mt-0.5">{node.subtitle}</p>}
        </div>

        {node.probability != null && (
          <div className={`p-2.5 rounded-lg ${config.bgClass} border ${config.borderClass}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-neutral-400">Probabilité</span>
              <span className={`text-sm font-bold ${config.textClass}`}>{Math.round(node.probability * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${Math.round(node.probability * 100)}%` }} />
            </div>
          </div>
        )}

        {node.summary && (
          <div>
            <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Résumé</h4>
            <p className="text-xs text-neutral-300 leading-relaxed">{node.summary}</p>
          </div>
        )}

        {(node.regionTags?.length || node.sectorTags?.length) && (
          <div className="flex flex-wrap gap-1">
            {node.regionTags?.map(r => (
              <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">{r}</span>
            ))}
            {node.sectorTags?.map(s => (
              <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">{s}</span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5">
          {isReadableNode && (
            <a
              href={readTarget.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25 transition-colors"
              title="S’ouvre dans un nouvel onglet — le graphe reste ici"
            >
              <Newspaper size={11} /> {readTarget.label}
            </a>
          )}
          <button onClick={() => onRecenter(node.id)} className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/25 transition-colors">
            <Crosshair size={11} /> Recentrer
          </button>
          <button onClick={() => onRecenter(node.id)} className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-lg bg-violet-500/15 text-violet-400 border border-violet-500/25 hover:bg-violet-500/25 transition-colors">
            <Network size={11} /> Explorer voisinage
          </button>
          {node.url && /^https?:\/\//i.test(node.url) && readTarget.kind !== 'external' && (
            <a href={node.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 transition-colors">
              <ExternalLink size={11} /> Source externe
            </a>
          )}
          <button
            onClick={() => navigator.clipboard.writeText(node.label)}
            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 border border-neutral-700 hover:bg-neutral-700 transition-colors"
          >
            <Copy size={11} />
          </button>
        </div>

        {/* Linked articles & signals — with read links */}
        {linkedArticles.length > 0 && (
          <div>
            <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Sources & articles liés ({linkedArticles.length})
            </h4>
            <div className="space-y-1.5">
              {linkedArticles.map(({ edge, neighbor }) => {
                if (!neighbor) return null
                const ncfg = NODE_TYPE_CONFIG[neighbor.type]
                const neighborRead = resolveNodeReadTarget(neighbor)
                return (
                  <div key={edge.id} className="rounded-lg border border-neutral-800 bg-neutral-800/40 p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="text-xs mt-0.5">{ncfg.icon}</span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={neighborRead.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-medium text-amber-300 hover:text-amber-200 hover:underline text-left leading-snug transition-colors block"
                        >
                          {neighbor.label}
                          <ArrowUpRight size={10} className="inline ml-1 opacity-50" />
                        </a>
                        {neighbor.summary && (
                          <p className="text-[10px] text-neutral-500 mt-0.5 line-clamp-2">{neighbor.summary}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {neighbor.createdAt && <span className="text-[9px] text-neutral-600">{neighbor.createdAt}</span>}
                          {edge.explanation && <span className="text-[9px] text-neutral-500 italic">{edge.explanation}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <a
                            href={neighborRead.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                          >
                            {neighborRead.label} →
                          </a>
                          <button
                            onClick={() => onNavigate(neighbor.id)}
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-neutral-700/50 text-neutral-400 border border-neutral-700 hover:bg-neutral-700 transition-colors"
                          >
                            Voir dans graphe
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* All connections */}
        <div>
          <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Connexions ({connectedNodes.length})
          </h4>
          <div className="space-y-3">
            {Array.from(groupedConnections.entries()).map(([label, items]) => (
              <div key={label}>
                <div className="text-[9px] font-semibold text-neutral-500 mb-1">{label}</div>
                <div className="space-y-1">
                  {items.map(({ edge, neighbor }) => {
                    if (!neighbor) return null
                    const ncfg = NODE_TYPE_CONFIG[neighbor.type]
                    return (
                      <button
                        key={edge.id}
                        onClick={() => onNavigate(neighbor.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800 transition-colors text-left group"
                      >
                        <span className="text-xs">{ncfg.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-neutral-200 truncate group-hover:text-blue-300 transition-colors">{neighbor.label}</div>
                          {edge.explanation && (
                            <div className="text-[9px] text-neutral-500 truncate">{edge.explanation}</div>
                          )}
                        </div>
                        {edge.confidence != null && (
                          <span className="text-[9px] text-neutral-600 flex-shrink-0">{Math.round(edge.confidence * 100)}%</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {node.createdAt && (
          <div className="pt-2 border-t border-neutral-800">
            <span className="text-[10px] text-neutral-600">Créé le {node.createdAt}</span>
          </div>
        )}
      </div>
    </div>
  )
}
