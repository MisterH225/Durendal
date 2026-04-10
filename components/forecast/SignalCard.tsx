import Link from 'next/link'
import { ArrowRight, CheckCircle2, TrendingUp, Zap, Newspaper, ExternalLink } from 'lucide-react'
import type { Locale } from '@/lib/i18n/translations'
import { tr } from '@/lib/i18n/translations'

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

const SEVERITY_DOT: Record<string, string> = {
  high:   'bg-red-500',
  medium: 'bg-amber-500',
  low:    'bg-emerald-500',
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
  const sevDot    = SEVERITY_DOT[s.severity ?? 'low'] ?? 'bg-neutral-600'
  const typeLabel = signalTypeBadge(s.signal_type, locale)
  const dateStr   = new Date(s.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="group rounded-2xl border border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900 transition-all p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {ch && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chColor}`}>
              {channelName(ch, locale)}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-neutral-700 text-neutral-400 bg-neutral-800">
            <SignalIcon type={s.signal_type} />
            {typeLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${sevDot}`} title={s.severity ?? ''} />
          <span className="text-[10px] text-neutral-600 whitespace-nowrap">{dateStr}</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-1.5">
        <p className="text-sm font-semibold text-neutral-100 leading-snug line-clamp-2">{s.title}</p>
        {s.summary && !compact && (
          <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">{s.summary}</p>
        )}
      </div>

      {/* For news signals: region + source attribution */}
      {s.signal_type === 'news' && !compact && (s.data?.region || s.data?.source_hint) && (
        <div className="flex items-center gap-3 flex-wrap">
          {s.data.region && (
            <span className="text-[10px] text-neutral-500 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-violet-400/60 inline-block" />
              {s.data.region as string}
            </span>
          )}
          {s.data.source_hint && (
            <span className="text-[10px] text-neutral-600">
              via {s.data.source_hint as string}
            </span>
          )}
        </div>
      )}

      {/* Source link for news signals */}
      {s.signal_type === 'news' && s.data?.source_url && (
        <div className="border-t border-neutral-800 pt-3">
          <a
            href={s.data.source_url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
          >
            <ExternalLink size={11} className="flex-shrink-0" />
            {locale === 'fr' ? 'Lire l\'article source' : 'Read source article'}
            <ArrowRight size={10} className="ml-auto" />
          </a>
        </div>
      )}

      {/* Grounding sources (additional references) */}
      {s.signal_type === 'news' && !compact && Array.isArray(s.data?.grounding_sources) && (s.data.grounding_sources as any[]).length > 0 && !s.data?.source_url && (
        <div className="border-t border-neutral-800 pt-3 space-y-1">
          <p className="text-[9px] font-semibold text-neutral-600 uppercase tracking-wider">Sources</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {(s.data.grounding_sources as { title: string; url: string }[]).slice(0, 3).map((gs, i) => (
              <a
                key={i}
                href={gs.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-400/70 hover:text-blue-300 transition-colors flex items-center gap-1 truncate max-w-[200px]"
              >
                <ExternalLink size={8} className="flex-shrink-0" />
                {gs.title || new URL(gs.url).hostname}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Linked question + CTA */}
      {q && qHref && (
        <div className="border-t border-neutral-800 pt-3 flex items-center justify-between gap-2">
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
  )
}
