/** Courbe minimaliste (blended %) pour les cartes liste — 2+ points requis */

interface Props {
  values: (number | null | undefined)[]
  className?: string
}

export function BlendedMicroSpark({ values, className = '' }: Props) {
  const pts = values
    .map(v => (v == null ? null : Math.round(Math.max(0, Math.min(1, v)) * 100)))
    .filter((v): v is number => v !== null)
  if (pts.length < 2) return null

  const w = 112
  const h = 32
  const pad = 2
  const minV = Math.min(...pts)
  const maxV = Math.max(...pts)
  const span = Math.max(8, maxV - minV)
  const coords = pts.map((p, i) => {
    const x = pad + (i / (pts.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (p - minV) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const d = `M ${coords.join(' L ')}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`text-indigo-400/90 ${className}`} width={w} height={h} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
