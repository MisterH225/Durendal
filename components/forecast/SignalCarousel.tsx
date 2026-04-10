'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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

export function SignalCarousel({ signals, locale }: { signals: SignalItem[]; locale: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const animRef = useRef<number | null>(null)
  const speedRef = useRef(0.5) // px per frame

  const step = useCallback(() => {
    const el = scrollRef.current
    if (!el || paused) {
      animRef.current = requestAnimationFrame(step)
      return
    }

    el.scrollLeft += speedRef.current

    // Loop: when we've scrolled past the duplicated set, reset seamlessly
    const halfWidth = el.scrollWidth / 2
    if (el.scrollLeft >= halfWidth) {
      el.scrollLeft -= halfWidth
    }

    animRef.current = requestAnimationFrame(step)
  }, [paused])

  useEffect(() => {
    animRef.current = requestAnimationFrame(step)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [step])

  if (!signals.length) return null

  // Duplicate signals for infinite loop effect
  const items = [...signals, ...signals]

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-neutral-950 to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-neutral-950 to-transparent" />

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-hidden scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {items.map((s, i) => {
          const ch        = s.forecast_channels
          const chColor   = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400'
          const sourceUrl = s.data?.source_url as string | undefined
          const imageUrl  = s.data?.image_url  as string | undefined

          return (
            <div
              key={`${s.id}-${i}`}
              className="flex-shrink-0 w-[280px] rounded-xl border border-neutral-800 bg-neutral-900/60 hover:border-neutral-600 hover:bg-neutral-900 transition-all overflow-hidden group cursor-default"
            >
              {/* Image compacte */}
              {imageUrl && (
                <div className="relative w-full h-24 bg-neutral-800 overflow-hidden">
                  <img
                    src={imageUrl}
                    alt=""
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/30 to-transparent" />
                </div>
              )}

              <div className="p-3.5 space-y-2">
                {/* Channel + time */}
                <div className="flex items-center gap-1.5">
                  <SignalIcon type={s.signal_type} />
                  {ch && (
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${chColor}`}>
                      {channelLabel(ch, locale)}
                    </span>
                  )}
                  <span className="text-[9px] text-neutral-600 ml-auto">{timeAgo(s.created_at, locale)}</span>
                </div>

                {/* Title */}
                <h4 className="text-xs font-semibold text-neutral-100 leading-snug line-clamp-2">
                  {s.title}
                </h4>

                {/* Summary */}
                {s.summary && (
                  <p className="text-[11px] text-neutral-500 leading-relaxed line-clamp-2">{s.summary}</p>
                )}

                {/* Source link */}
                {sourceUrl && (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] font-medium text-blue-400/80 hover:text-blue-300 transition-colors pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={9} />
                    {locale === 'fr' ? 'Lire' : 'Read'}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
