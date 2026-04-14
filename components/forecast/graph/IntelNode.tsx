'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { IntelligenceGraphNode } from '@/lib/graph/types'
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
  anchor: 'Événement principal',
  concurrent: 'Simultané',
  consequence: 'Conséquence',
  future: 'Projection',
}

function IntelNodeComponent({ data }: NodeProps) {
  const d = data as unknown as IntelNodeData
  const config = NODE_TYPE_CONFIG[d.type] ?? NODE_TYPE_CONFIG.article
  const isLarge = config.size === 'lg' || d.isAnchor
  const isMedium = config.size === 'md'

  const w = isLarge ? 'w-[270px]' : isMedium ? 'w-[230px]' : 'w-[210px]'
  const pad = isLarge ? 'p-3.5' : 'p-2.5'

  const dimCls = d.dimmed ? 'opacity-40' : ''
  const anchorRing = d.isAnchor ? 'ring-2 ring-amber-400/60 shadow-lg shadow-amber-500/10' : ''
  const selectedRing = d.isSelected ? 'ring-2 ring-blue-400' : ''

  const meta = (d.metadata ?? {}) as Record<string, unknown>
  const temporalPosition = meta.temporalPosition as string | undefined
  const confidence = meta.confidence as number | undefined
  const isOutcome = d.type === 'outcome'
  const outcomeStatus = meta.outcomeStatus as string | undefined
  const supportingEvidence = meta.supportingEvidence as string[] | undefined
  const contradictingEvidence = meta.contradictingEvidence as string[] | undefined
  const probSource = meta.probabilitySource as string | undefined

  return (
    <>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-neutral-600 !border-neutral-700" />
      <div className={`${w} ${pad} rounded-xl border ${config.borderClass} ${config.bgClass} ${dimCls} ${anchorRing} ${selectedRing} backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] cursor-pointer`}>
        <div className="flex items-start gap-2.5">
          <span className={`${isLarge ? 'text-lg' : 'text-base'} flex-shrink-0 mt-0.5`}>{config.icon}</span>
          <div className="min-w-0 flex-1">
            <div className={`${isLarge ? 'text-[14px]' : 'text-[13px]'} font-bold leading-snug ${d.dimmed ? 'text-neutral-500' : 'text-neutral-100'} line-clamp-2`}>
              {d.label}
            </div>
            {d.subtitle && (
              <div className="text-[11px] text-neutral-500 mt-0.5 truncate">{d.subtitle}</div>
            )}
            {isOutcome && d.probability != null && (
              <div className="mt-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.round(d.probability * 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-teal-400">
                    {Math.round(d.probability * 100)}%
                  </span>
                </div>
                {probSource && (
                  <div className="text-[9px] text-teal-600 mt-0.5">
                    {probSource === 'ai_estimate' ? 'Estimation IA' : probSource === 'crowd' ? 'Communauté' : probSource === 'blended' ? 'Mixte' : probSource}
                  </div>
                )}
                {supportingEvidence && supportingEvidence.length > 0 && (
                  <div className="mt-1 text-[9px] text-emerald-600 line-clamp-1">
                    + {supportingEvidence[0]}
                  </div>
                )}
                {contradictingEvidence && contradictingEvidence.length > 0 && (
                  <div className="text-[9px] text-red-500 line-clamp-1">
                    − {contradictingEvidence[0]}
                  </div>
                )}
              </div>
            )}
            {!isOutcome && d.probability != null && (
              <div className="mt-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round(d.probability * 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-violet-400">
                    {Math.round(d.probability * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5 gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.textClass}`}>
              {config.label}
            </span>
            {temporalPosition && (
              <span className="text-[9px] text-neutral-600 truncate">
                {POSITION_LABELS[temporalPosition] ?? temporalPosition}
              </span>
            )}
            {isOutcome && outcomeStatus && (
              <span className={`text-[9px] px-1 py-0.5 rounded ${
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
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {confidence != null && confidence > 0 && !isOutcome && (
              <span className="text-[9px] text-neutral-600">{Math.round(confidence * 100)}%</span>
            )}
            {d.createdAt && (
              <span className="text-[10px] text-neutral-600">{d.createdAt}</span>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-neutral-600 !border-neutral-700" />
    </>
  )
}

export const IntelNode = memo(IntelNodeComponent)
