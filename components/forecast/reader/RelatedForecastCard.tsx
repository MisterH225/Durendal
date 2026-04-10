import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { RelatedForecast } from '@/lib/forecast/mock-articles'

function pct(v: number): string { return `${Math.round(v * 100)}%` }

function barColor(v: number): string {
  if (v >= 0.7) return 'bg-emerald-500'
  if (v >= 0.4) return 'bg-amber-500'
  return 'bg-red-500'
}

interface Props {
  forecast: RelatedForecast
  locale: string
}

export function RelatedForecastCard({ forecast: f, locale }: Props) {
  return (
    <Link
      href={`/forecast/q/${f.id}`}
      className="block rounded-xl border border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900 transition-all p-4 space-y-3 group"
    >
      <p className="text-xs font-medium text-neutral-200 leading-snug line-clamp-2 group-hover:text-white transition-colors">
        {f.title}
      </p>

      {/* Probability bars */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-neutral-600 w-10 flex-shrink-0">
            {locale === 'fr' ? 'Foule' : 'Crowd'}
          </span>
          <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor(f.crowdProbability)} transition-all`}
                 style={{ width: pct(f.crowdProbability) }} />
          </div>
          <span className="text-[10px] font-mono text-neutral-400 w-8 text-right">{pct(f.crowdProbability)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-neutral-600 w-10 flex-shrink-0">IA</span>
          <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor(f.aiProbability)} transition-all`}
                 style={{ width: pct(f.aiProbability) }} />
          </div>
          <span className="text-[10px] font-mono text-neutral-400 w-8 text-right">{pct(f.aiProbability)}</span>
        </div>
      </div>

      {/* Blended */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-neutral-300">
            {locale === 'fr' ? 'Consensus' : 'Blended'}
          </span>
          <span className="text-sm font-bold text-white font-mono">{pct(f.blendedProbability)}</span>
        </div>
        <ArrowRight size={12} className="text-neutral-600 group-hover:text-blue-400 transition-colors" />
      </div>
    </Link>
  )
}
