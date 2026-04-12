'use client'

import { NODE_TYPE_CONFIG, type GraphNodeType } from '@/lib/graph/types'

interface NodeLegendProps {
  activeTypes: GraphNodeType[]
}

export function NodeLegend({ activeTypes }: NodeLegendProps) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {(Object.entries(NODE_TYPE_CONFIG) as [GraphNodeType, typeof NODE_TYPE_CONFIG[GraphNodeType]][])
        .filter(([type]) => activeTypes.includes(type))
        .map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1">
            <span className="text-xs">{cfg.icon}</span>
            <span className="text-[9px] text-neutral-500">{cfg.label}</span>
          </div>
        ))}
    </div>
  )
}
