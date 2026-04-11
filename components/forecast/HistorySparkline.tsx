'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Locale } from '@/lib/i18n/translations'

interface HistoryPoint { snapshot_at: string; blended_probability: number | null; crowd_probability: number | null; ai_probability: number | null }
interface Props { data: HistoryPoint[]; compact?: boolean; locale?: Locale; emptyLabel?: string }

export function HistorySparkline({ data, compact = false, locale = 'fr', emptyLabel }: Props) {
  const dateLocale = locale === 'en' ? 'en-GB' : 'fr-FR'
  const empty = emptyLabel ?? (locale === 'en' ? 'No history yet' : 'Pas encore de données')
  if (!data.length) return <div className="flex items-center justify-center text-neutral-600 text-xs" style={{ height: compact ? 60 : 140 }}>{empty}</div>
  const chartData = data.map(d => ({
    date:    new Date(d.snapshot_at).toLocaleDateString(dateLocale, { day: '2-digit', month: 'short' }),
    blended: d.blended_probability !== null ? Math.round(d.blended_probability * 100) : null,
    crowd:   d.crowd_probability   !== null ? Math.round(d.crowd_probability   * 100) : null,
    ai:      d.ai_probability      !== null ? Math.round(d.ai_probability      * 100) : null,
  }))
  return (
    <ResponsiveContainer width="100%" height={compact ? 60 : 160}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="blendedGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#818cf8" stopOpacity={0.25} /><stop offset="95%" stopColor="#818cf8" stopOpacity={0} /></linearGradient>
          <linearGradient id="crowdGrad"   x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#34d399" stopOpacity={0.15} /><stop offset="95%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
          <linearGradient id="aiGrad"      x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#60a5fa" stopOpacity={0.15} /><stop offset="95%" stopColor="#60a5fa" stopOpacity={0} /></linearGradient>
        </defs>
        {!compact && <XAxis dataKey="date" tick={{ fill: '#525252', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />}
        {!compact && <YAxis domain={[0, 100]} tick={{ fill: '#525252', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />}
        {!compact && <Tooltip contentStyle={{ background: '#171717', border: '1px solid #262626', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#737373' }} itemStyle={{ color: '#e5e5e5' }} formatter={(v: number) => [`${v}%`]} />}
        <Area type="monotone" dataKey="crowd"   stroke="#34d399" strokeWidth={compact ? 1 : 1.5} fill="url(#crowdGrad)"   dot={false} connectNulls name="Crowd" />
        <Area type="monotone" dataKey="ai"      stroke="#60a5fa" strokeWidth={compact ? 1 : 1.5} fill="url(#aiGrad)"      dot={false} connectNulls name="IA" />
        <Area type="monotone" dataKey="blended" stroke="#818cf8" strokeWidth={compact ? 1.5 : 2} fill="url(#blendedGrad)" dot={false} connectNulls name="Blended" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
