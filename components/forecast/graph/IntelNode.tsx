'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { IntelligenceGraphNode, SourceArticle } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG } from '@/lib/graph/types'

export type IntelNodeData = IntelligenceGraphNode & {
  isAnchor?: boolean
  isSelected?: boolean
  dimmed?: boolean
}

const POSITION_LABELS: Record<string, string> = {
  deep_past: 'Passé lointain',
  past: 'Passé',
  recent: 'Récent',
  anchor: 'Événement central',
  concurrent: 'Simultané',
  consequence: 'Conséquence',
  future: 'Projection',
}

function IntelNodeComponent({ data }: NodeProps) {
  const d = data as unknown as IntelNodeData
  const config = NODE_TYPE_CONFIG[d.type] ?? NODE_TYPE_CONFIG.article
  const isAnchor = d.isAnchor
  const isOutcome = d.type === 'outcome'

  const meta = (d.metadata ?? {}) as Record<string, unknown>
  const temporalPosition = meta.temporalPosition as string | undefined
  const confidence = meta.confidence as number | undefined
  const isTrunk = meta.isTrunk as boolean | undefined
  const isCorollary = meta.isCorollary as boolean | undefined
  const outcomeStatus = meta.outcomeStatus as string | undefined
  const supportingEvidence = meta.supportingEvidence as string[] | undefined
  const contradictingEvidence = meta.contradictingEvidence as string[] | undefined
  const probSource = meta.probabilitySource as string | undefined
  const sourceArticles = meta.sourceArticles as SourceArticle[] | undefined

  const w = isAnchor ? 'w-[310px]' : isOutcome ? 'w-[280px]' : 'w-[280px]'
  const dimCls = d.dimmed ? 'opacity-30' : ''
  const anchorRing = isAnchor ? 'ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/20' : ''
  const selectedRing = d.isSelected ? 'ring-2 ring-blue-400' : ''
  const corollaryStyle = isCorollary ? 'border-dashed' : ''

  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-neutral-600 !border-neutral-700" />
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-neutral-600 !border-neutral-700" id="top" />

      <div className={`${w} rounded-xl border ${config.borderClass} ${config.bgClass} ${dimCls} ${anchorRing} ${selectedRing} ${corollaryStyle} backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] cursor-pointer overflow-hidden`}>
        {/* Header bar */}
        <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{config.icon}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${config.textClass}`}>
              {config.label}
            </span>
            {temporalPosition && (
              <span className="text-[9px] text-neutral-600">
                {POSITION_LABELS[temporalPosition] ?? ''}
              </span>
            )}
          </div>
          {d.subtitle && (
            <span className="text-[10px] text-neutral-500 font-medium">{d.subtitle}</span>
          )}
        </div>

        {/* Body */}
        <div className="px-3 py-2">
          {/* Title */}
          <div className={`${isAnchor ? 'text-[15px]' : 'text-[13px]'} font-bold leading-snug ${d.dimmed ? 'text-neutral-500' : 'text-neutral-100'} line-clamp-2`}>
            {d.label}
          </div>

          {/* Summary (new) */}
          {d.summary && (
            <div className="mt-1.5 text-[11px] text-neutral-400 leading-relaxed line-clamp-3">
              {d.summary}
            </div>
          )}

          {/* Probability bar for outcomes */}
          {isOutcome && d.probability != null && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
                  <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.round(d.probability * 100)}%` }} />
                </div>
                <span className="text-[13px] font-bold text-teal-400">
                  {Math.round(d.probability * 100)}%
                </span>
              </div>
              {probSource && (
                <div className="text-[9px] text-teal-600 mt-0.5">
                  {probSource === 'ai_estimate' ? 'Estimation IA' : probSource === 'crowd' ? 'Communauté' : probSource === 'blended' ? 'Mixte' : probSource}
                </div>
              )}
              {supportingEvidence && supportingEvidence.length > 0 && (
                <div className="mt-1 text-[9px] text-emerald-500 line-clamp-1">+ {supportingEvidence[0]}</div>
              )}
              {contradictingEvidence && contradictingEvidence.length > 0 && (
                <div className="text-[9px] text-red-400 line-clamp-1">− {contradictingEvidence[0]}</div>
              )}
              {outcomeStatus && (
                <span className={`inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded ${
                  outcomeStatus === 'projected' ? 'bg-teal-900/40 text-teal-400' :
                  outcomeStatus === 'verified' ? 'bg-emerald-900/40 text-emerald-400' :
                  outcomeStatus === 'contradicted' ? 'bg-red-900/40 text-red-400' :
                  'bg-neutral-800 text-neutral-500'
                }`}>
                  {outcomeStatus === 'projected' ? 'Projeté' :
                   outcomeStatus === 'verified' ? 'Vérifié' :
                   outcomeStatus === 'contradicted' ? 'Contredit' : 'Expiré'}
                </span>
              )}
            </div>
          )}

          {/* Non-outcome probability */}
          {!isOutcome && d.probability != null && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round(d.probability * 100)}%` }} />
              </div>
              <span className="text-[11px] font-bold text-violet-400">{Math.round(d.probability * 100)}%</span>
            </div>
          )}

          {/* Source articles (new — clickable links) */}
          {sourceArticles && sourceArticles.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-white/5 space-y-1">
              {sourceArticles.slice(0, 3).map((article, idx) => (
                <a
                  key={idx}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 truncate transition-colors"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="flex-shrink-0">📰</span>
                  <span className="truncate">{article.title}</span>
                </a>
              ))}
            </div>
          )}

          {/* Fallback: single sourceUrl if no sourceArticles */}
          {(!sourceArticles || sourceArticles.length === 0) && d.url && (
            <div className="mt-2 pt-1.5 border-t border-white/5">
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 truncate transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <span className="flex-shrink-0">🔗</span>
                <span className="truncate">Lire l&apos;article source</span>
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        {confidence != null && confidence > 0 && !isOutcome && (
          <div className="px-3 py-1 border-t border-white/5 flex items-center justify-between">
            <span className="text-[9px] text-neutral-600">Confiance: {Math.round(confidence * 100)}%</span>
            {isTrunk && <span className="text-[9px] text-amber-600 font-medium">Chaîne principale</span>}
            {isCorollary && <span className="text-[9px] text-purple-500 font-medium">Effet collatéral</span>}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-neutral-600 !border-neutral-700" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-neutral-600 !border-neutral-700" id="bottom" />
    </>
  )
}

export const IntelNode = memo(IntelNodeComponent)
