import Link from 'next/link'
import { ArrowRight, CheckCircle2, TrendingUp, Zap, Newspaper, ExternalLink } from 'lucide-react'
import type { Locale } from '@/lib/i18n/translations'
import { tr } from '@/lib/i18n/translations'
import { SignalImage } from './SignalImage'

export interface SignalData {
  id: string
  signal_type: string
  title: string
  summary: string | null
  severity: 'high' | 'medium' | 'low' | null
  data: Record<string, unknown> | null
  created_at: string
  forecast_questions: { id: string; slug: string | null; title: string; blended_probability: number | null } | null
  forecast_channels:  { id: string; slug: string; name: string; name_fr?: string | null; name_en?: string | null } | null
}

const CHANNEL_COLORS: Record<string, string> = {
  'macro-commodities':        'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'politics-policy':          'bg-rose-500/10  text-rose-400  border-rose-500/20',
  'tech-ai':                  'bg-blue-500/10  text-blue-400  border-blue-500/20',
  'agriculture-risk':         'bg-green-500/10 text-green-400 border-green-500/20',
  'climate':                  'bg-teal-500/10  text-teal-400  border-teal-500/20',
  'logistics':                'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'regional-business-events': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

const SEVERITY_COLORS: Record<string, string> = {
  high:   'bg-red-500/10 text-red-400 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

function SignalIcon({ type }: { type: string }) {
  if (type === 'resolution')        return <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
  if (type === 'probability_shift') return <TrendingUp   size={14} className="text-blue-400    flex-shrink-0" />
  if (type === 'news')              return <Newspaper    size={14} className="text-violet-400   flex-shrink-0" />
  return                                    <Zap          size={14} className="text-amber-400   flex-shrink-0" />
}

function signalTypeBadge(type: string, locale: Locale): string {
  if (type === 'resolution')        return tr(locale, 'signals.type_resolve')
  if (type === 'probability_shift') return tr(locale, 'signals.type_shift')
  if (type === 'news')              return tr(locale, 'signals.type_news')
  return tr(locale, 'signals.type_signal')
}

function channelName(ch: SignalData['forecast_channels'], locale: Locale): string {
  if (!ch) return ''
  if (locale === 'fr' && ch.name_fr) return ch.name_fr
  if (locale === 'en' && ch.name_en) return ch.name_en
  return ch.name
}

function timeAgo(dateStr: string, locale: Locale): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  const hrs  = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (locale === 'fr') {
    if (mins < 60) return `il y a ${mins}min`
    if (hrs < 24)  return `il y a ${hrs}h`
    if (days === 1) return 'hier'
    return `il y a ${days}j`
  }
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24)  return `${hrs}h ago`
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

interface Props {
  signal:  SignalData
  locale:  Locale
  compact?: boolean
}

export function SignalCard({ signal: s, locale, compact = false }: Props) {
  const ch        = s.forecast_channels
  const q         = s.forecast_questions
  const qHref     = q ? `/forecast/q/${q.slug ?? q.id}` : null
  const chColor   = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400 border-neutral-700'
  const sevColor  = SEVERITY_COLORS[s.severity ?? 'low'] ?? SEVERITY_COLORS.low
  const typeLabel = signalTypeBadge(s.signal_type, locale)

  const sourceUrl  = s.data?.source_url as string | undefined
  const imageUrl   = s.data?.image_url  as string | undefined
  const region     = s.data?.region     as string | undefined
  const sourceHint = s.data?.source_hint as string | undefined

  const cardContent = (
    <div className="group rounded-2xl border border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900 transition-all overflow-hidden flex flex-col h-full">

      {/* Image d'illustration */}
      {imageUrl && !compact && <SignalImage src={imageUrl} />}

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ch && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chColor}`}>
              {channelName(ch, locale)}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sevColor}`}>
            {s.severity === 'high' ? '●' : s.severity === 'medium' ? '◐' : '○'}{' '}
            {s.severity === 'high' ? (locale === 'fr' ? 'Impact fort' : 'High impact')
              : s.severity === 'medium' ? (locale === 'fr' ? 'Impact modéré' : 'Moderate')
              : (locale === 'fr' ? 'Info' : 'Info')}
          </span>
          <span className="text-[10px] text-neutral-600 ml-auto whitespace-nowrap">
            {timeAgo(s.created_at, locale)}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-neutral-100 leading-snug line-clamp-2">{s.title}</h3>

        {/* Summary */}
        {s.summary && !compact && (
          <p className="text-xs text-neutral-400 leading-relaxed line-clamp-3">{s.summary}</p>
        )}

        {/* Meta: region + source */}
        {(region || sourceHint) && !compact && (
          <div className="flex items-center gap-3 flex-wrap mt-auto">
            {region && (
              <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-violet-400/60 inline-block" />
                {region}
              </span>
            )}
            {sourceHint && (
              <span className="text-[10px] text-neutral-600">
                via {sourceHint}
              </span>
            )}
          </div>
        )}

        {/* CTA: source link or question link */}
        {sourceUrl && (
          <div className="border-t border-neutral-800 pt-3 mt-auto">
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink size={11} className="flex-shrink-0" />
              {locale === 'fr' ? 'Lire l\'article' : 'Read article'}
              <ArrowRight size={10} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>
        )}

        {q && qHref && (
          <div className="border-t border-neutral-800 pt-3 mt-auto flex items-center justify-between gap-2">
            <p className="text-xs text-neutral-500 line-clamp-1 flex-1">{q.title}</p>
            <Link
              href={qHref}
              className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap"
            >
              {tr(locale, 'signals.view_question')}
              <ArrowRight size={11} />
            </Link>
          </div>
        )}
      </div>
    </div>
  )

  const detailHref = `/forecast/signals/${s.id}`

  return (
    <Link href={detailHref} className="block">
      {cardContent}
    </Link>
  )
}
