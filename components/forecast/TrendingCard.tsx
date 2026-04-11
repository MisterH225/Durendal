'use client'

import Link from 'next/link'
import { TrendingUp, Users, Calendar, MessageSquare, ChevronRight } from 'lucide-react'
import { HistorySparkline } from './HistorySparkline'
import type { Locale } from '@/lib/i18n/translations'

interface HistoryPoint {
  snapshot_at: string
  blended_probability: number | null
  crowd_probability: number | null
  ai_probability: number | null
}

interface TrendingQuestion {
  id: string
  slug: string
  title: string
  description: string | null
  close_date: string
  blended_probability: number | null
  ai_probability: number | null
  crowd_probability: number | null
  forecast_count: number
  channel_slug: string
  channel_name: string
  image_url: string | null
  history: HistoryPoint[]
  aiSummary: string | null
  commentCount: number
}

const CHANNEL_COLORS: Record<string, string> = {
  'macro-commodities':        'text-amber-400',
  'politics-policy':          'text-rose-400',
  'tech-ai':                  'text-blue-400',
  'agriculture-risk':         'text-green-400',
  'climate':                  'text-teal-400',
  'logistics':                'text-orange-400',
  'regional-business-events': 'text-purple-400',
}

function probColor(v: number): string {
  if (v < 25) return 'text-red-400'
  if (v < 40) return 'text-orange-400'
  if (v < 55) return 'text-yellow-400'
  if (v < 70) return 'text-green-400'
  return 'text-emerald-400'
}

export function TrendingCard({ q, locale }: { q: TrendingQuestion; locale: Locale }) {
  const blended = q.blended_probability != null ? Math.round(q.blended_probability * 100) : null
  const aiPct = q.ai_probability != null ? Math.round(q.ai_probability * 100) : null
  const href = `/forecast/q/${encodeURIComponent(q.slug ?? q.id)}`
  const chColor = CHANNEL_COLORS[q.channel_slug] ?? 'text-neutral-400'

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      {/* Top row: channel + badge */}
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${chColor}`}>
          {q.channel_name}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
          <TrendingUp size={9} />
          Trending
        </span>
      </div>

      {/* Question title */}
      <Link href={href} className="block px-5 group">
        <h2 className="text-lg md:text-xl font-bold text-white leading-snug group-hover:text-blue-300 transition-colors">
          {q.title}
        </h2>
      </Link>

      {/* Main content: graph + probabilities */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex flex-col md:flex-row gap-5">
          {/* Left: probability display */}
          <div className="flex flex-col gap-3 md:w-48 flex-shrink-0">
            {/* Big blended probability */}
            <div className="text-center md:text-left">
              <div className={`text-4xl font-black tabular-nums ${blended != null ? probColor(blended) : 'text-neutral-600'}`}>
                {blended != null ? `${blended}%` : '—'}
              </div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide mt-0.5">
                {locale === 'fr' ? 'Probabilité combinée' : 'Blended probability'}
              </div>
            </div>

            {/* AI + Crowd sub-probabilities */}
            <div className="flex gap-4 md:flex-col md:gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-[11px] text-neutral-400">IA</span>
                <span className="text-[11px] font-bold text-blue-400 ml-auto tabular-nums">
                  {aiPct != null ? `${aiPct}%` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] text-neutral-400">{locale === 'fr' ? 'Foule' : 'Crowd'}</span>
                <span className="text-[11px] font-bold text-emerald-400 ml-auto tabular-nums">
                  {q.crowd_probability != null ? `${Math.round(q.crowd_probability * 100)}%` : '—'}
                </span>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-[10px] text-neutral-500 pt-1">
              <span className="flex items-center gap-1"><Users size={10} />{q.forecast_count}</span>
              <span className="flex items-center gap-1"><MessageSquare size={10} />{q.commentCount}</span>
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {new Date(q.close_date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' })}
              </span>
            </div>
          </div>

          {/* Right: probability history chart */}
          <div className="flex-1 min-w-0">
            <HistorySparkline
              data={q.history}
              locale={locale}
              emptyLabel={locale === 'fr' ? 'Données en cours de collecte…' : 'Collecting data…'}
            />
          </div>
        </div>
      </div>

      {/* Context summary */}
      {(q.aiSummary || q.description) && (
        <div className="px-5 pb-3">
          <p className="text-xs text-neutral-400 leading-relaxed line-clamp-3">
            {(q.aiSummary ?? q.description ?? '').slice(0, 300)}
          </p>
        </div>
      )}

      {/* Bottom action bar */}
      <Link
        href={href}
        className="flex items-center justify-between px-5 py-3 border-t border-neutral-800/60 hover:bg-neutral-800/30 transition-colors group"
      >
        <span className="text-xs font-medium text-blue-400 group-hover:text-blue-300">
          {locale === 'fr' ? 'Voir le détail & participer' : 'View details & participate'}
        </span>
        <ChevronRight size={14} className="text-neutral-600 group-hover:text-blue-400 transition-colors" />
      </Link>
    </div>
  )
}
