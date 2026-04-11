'use client'

import { ExternalLink, Newspaper, TrendingUp, CheckCircle2, Zap } from 'lucide-react'

interface SignalItem {
  id: string
  signal_type: string
  title: string
  summary: string | null
  severity: 'high' | 'medium' | 'low' | null
  data: Record<string, unknown> | null
  created_at: string
  forecast_channels: { slug: string; name: string; name_fr?: string | null; name_en?: string | null } | null
}

const CHANNEL_COLORS: Record<string, string> = {
  'macro-commodities':        'bg-amber-500/15 text-amber-400',
  'politics-policy':          'bg-rose-500/15  text-rose-400',
  'tech-ai':                  'bg-blue-500/15  text-blue-400',
  'agriculture-risk':         'bg-green-500/15 text-green-400',
  'climate':                  'bg-teal-500/15  text-teal-400',
  'logistics':                'bg-orange-500/15 text-orange-400',
  'regional-business-events': 'bg-purple-500/15 text-purple-400',
}

function SignalIcon({ type }: { type: string }) {
  if (type === 'resolution')        return <CheckCircle2 size={11} className="text-emerald-400" />
  if (type === 'probability_shift') return <TrendingUp   size={11} className="text-blue-400" />
  if (type === 'news')              return <Newspaper    size={11} className="text-violet-400" />
  return                                    <Zap          size={11} className="text-amber-400" />
}

function timeAgo(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  const hrs  = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (locale === 'fr') {
    if (mins < 60) return `${mins}min`
    if (hrs < 24)  return `${hrs}h`
    return `${days}j`
  }
  if (mins < 60) return `${mins}m`
  if (hrs < 24)  return `${hrs}h`
  return `${days}d`
}

function channelLabel(ch: SignalItem['forecast_channels'], locale: string): string {
  if (!ch) return ''
  if (locale === 'fr' && ch.name_fr) return ch.name_fr
  if (locale === 'en' && ch.name_en) return ch.name_en
  return ch.name
}

export function SignalFeedVertical({ signals, locale }: { signals: SignalItem[]; locale: string }) {
  if (!signals.length) {
    return (
      <div className="text-center text-neutral-600 text-xs py-8">
        {locale === 'fr' ? 'Aucun signal récent.' : 'No recent signals.'}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {signals.map(s => {
        const ch        = s.forecast_channels
        const chColor   = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400'
        const sourceUrl = s.data?.source_url as string | undefined
        const imageUrl  = s.data?.image_url  as string | undefined

        return (
          <a
            key={s.id}
            href={`/forecast/signals/${s.id}`}
            className="block rounded-xl border border-neutral-800/60 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/70 transition-all overflow-hidden group"
          >
            {imageUrl && (
              <div className="relative w-full h-20 bg-neutral-800 overflow-hidden">
                <img
                  src={imageUrl}
                  alt=""
                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />
              </div>
            )}

            <div className="p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <SignalIcon type={s.signal_type} />
                {ch && (
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${chColor}`}>
                    {channelLabel(ch, locale)}
                  </span>
                )}
                <span className="text-[9px] text-neutral-600 ml-auto">{timeAgo(s.created_at, locale)}</span>
              </div>

              <h4 className="text-[11px] font-semibold text-neutral-200 leading-snug line-clamp-2">
                {s.title}
              </h4>

              {s.summary && (
                <p className="text-[10px] text-neutral-500 leading-relaxed line-clamp-2">{s.summary}</p>
              )}

              {sourceUrl && (
                <span className="flex items-center gap-1 text-[9px] font-medium text-blue-400/70 pt-0.5">
                  <ExternalLink size={8} />
                  {locale === 'fr' ? 'Lire' : 'Read'}
                </span>
              )}
            </div>
          </a>
        )
      })}
    </div>
  )
}
