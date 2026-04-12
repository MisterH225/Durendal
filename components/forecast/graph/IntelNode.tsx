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

function IntelNodeComponent({ data }: NodeProps) {
  const d = data as unknown as IntelNodeData
  const config = NODE_TYPE_CONFIG[d.type] ?? NODE_TYPE_CONFIG.article
  const isLarge = config.size === 'lg'
  const isMedium = config.size === 'md'

  const w = isLarge ? 'w-[260px]' : isMedium ? 'w-[220px]' : 'w-[200px]'
  const pad = isLarge ? 'p-3.5' : 'p-2.5'

  const dimCls = d.dimmed ? 'opacity-40' : ''
  const anchorRing = d.isAnchor ? 'ring-2 ring-amber-400/60' : ''
  const selectedRing = d.isSelected ? 'ring-2 ring-blue-400' : ''

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-neutral-600 !border-neutral-700" />
      <div className={`${w} ${pad} rounded-lg border ${config.borderClass} ${config.bgClass} ${dimCls} ${anchorRing} ${selectedRing} backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] cursor-pointer`}>
        <div className="flex items-start gap-2.5">
          <span className="text-base flex-shrink-0 mt-0.5">{config.icon}</span>
          <div className="min-w-0 flex-1">
            <div className={`text-[13px] font-bold leading-snug ${d.dimmed ? 'text-neutral-500' : 'text-neutral-100'} line-clamp-2`}>
              {d.label}
            </div>
            {d.subtitle && (
              <div className="text-[11px] text-neutral-500 mt-0.5 truncate">{d.subtitle}</div>
            )}
            {d.probability != null && (
              <div className="mt-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${Math.round(d.probability * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-violet-400">{Math.round(d.probability * 100)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.textClass}`}>
            {config.label}
          </span>
          {d.createdAt && (
            <span className="text-[10px] text-neutral-600">{d.createdAt}</span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-neutral-600 !border-neutral-700" />
    </>
  )
}

export const IntelNode = memo(IntelNodeComponent)
