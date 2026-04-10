'use client'

interface Props {
  value: number | null      // 0–100
  size?: number
  strokeWidth?: number
  label?: string
  sublabel?: string
  colorOverride?: string
}

function probColor(v: number): string {
  if (v < 25) return '#ef4444'
  if (v < 40) return '#f97316'
  if (v < 55) return '#eab308'
  if (v < 70) return '#22c55e'
  return '#10b981'
}

export function ProbabilityGauge({ value, size = 120, strokeWidth = 10, label, sublabel, colorOverride }: Props) {
  const pct    = value ?? 0
  const radius = (size - strokeWidth) / 2
  const cx = size / 2, cy = size / 2
  const startAngle = -210, endAngle = 30, totalDeg = 240

  function polar(angleDeg: number, r: number) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }
  function describeArc(from: number, to: number) {
    const s = polar(from, radius), e = polar(to, radius)
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`
  }

  const fillDeg   = startAngle + (pct / 100) * totalDeg
  const trackPath = describeArc(startAngle, endAngle)
  const fillPath  = pct > 0 ? describeArc(startAngle, Math.min(fillDeg, endAngle - 0.01)) : null
  const color     = colorOverride ?? (value !== null ? probColor(pct) : '#404040')

  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <svg width={size} height={size} className="overflow-visible">
        <path d={trackPath} fill="none" stroke="#262626" strokeWidth={strokeWidth} strokeLinecap="round" />
        {fillPath && <path d={fillPath} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" style={{ transition: 'all 0.6s ease' }} />}
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize={size * 0.22} fontWeight="700" fill={value !== null ? color : '#525252'} fontFamily="ui-monospace, monospace">
          {value !== null ? `${Math.round(pct)}%` : '—'}
        </text>
      </svg>
      {label    && <div className="text-xs font-semibold text-neutral-300 text-center leading-tight">{label}</div>}
      {sublabel && <div className="text-[10px] text-neutral-600 text-center">{sublabel}</div>}
    </div>
  )
}
