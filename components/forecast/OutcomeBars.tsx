'use client'

interface Outcome {
  id: string
  label: string
  blended_probability: number | null
  ai_probability: number | null
  color: string | null
  sort_order: number
}

const FALLBACK_COLORS = ['#818cf8', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4']

export function OutcomeBars({ outcomes, compact = false }: { outcomes: Outcome[]; compact?: boolean }) {
  const sorted = [...outcomes].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className={`w-full space-y-${compact ? '1.5' : '2'}`}>
      {sorted.map((o, idx) => {
        const pct = o.blended_probability != null
          ? Math.round(o.blended_probability * 100)
          : o.ai_probability != null
          ? Math.round(o.ai_probability * 100)
          : 0
        const color = o.color ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]

        return (
          <div key={o.id} className="group">
            <div className="flex items-center justify-between mb-0.5">
              <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-medium text-neutral-200 truncate pr-2`}>
                {o.label}
              </span>
              <span
                className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold tabular-nums flex-shrink-0`}
                style={{ color }}
              >
                {pct}%
              </span>
            </div>
            <div className={`w-full ${compact ? 'h-1.5' : 'h-2'} bg-neutral-800 rounded-full overflow-hidden`}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(1, pct)}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
