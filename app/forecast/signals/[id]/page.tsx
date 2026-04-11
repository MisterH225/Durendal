import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Calendar, Radio, Tag, MapPin, Newspaper, TrendingUp, CheckCircle2, Zap } from 'lucide-react'
import { getLocale } from '@/lib/i18n/server'
import { localizeChannel } from '@/lib/forecast/locale'
import { SignalImage } from '@/components/forecast/SignalImage'
import { BookmarkButton, ShareButton } from '@/components/forecast/SignalActions'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const CHANNEL_COLORS: Record<string, string> = {
  'macro-commodities':        'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'politics-policy':          'bg-rose-500/10  text-rose-400  border-rose-500/20',
  'tech-ai':                  'bg-blue-500/10  text-blue-400  border-blue-500/20',
  'agriculture-risk':         'bg-green-500/10 text-green-400 border-green-500/20',
  'climate':                  'bg-teal-500/10  text-teal-400  border-teal-500/20',
  'logistics':                'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'regional-business-events': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

const SEVERITY_LABELS: Record<string, Record<string, string>> = {
  high:   { fr: 'Impact fort',   en: 'High impact' },
  medium: { fr: 'Impact modéré', en: 'Moderate impact' },
  low:    { fr: 'Information',   en: 'Information' },
}

function SignalTypeIcon({ type }: { type: string }) {
  if (type === 'resolution')        return <CheckCircle2 size={16} className="text-emerald-400" />
  if (type === 'probability_shift') return <TrendingUp   size={16} className="text-blue-400" />
  if (type === 'news')              return <Newspaper    size={16} className="text-violet-400" />
  return                                    <Zap          size={16} className="text-amber-400" />
}

function signalTypeLabel(type: string, locale: string): string {
  if (type === 'news')              return locale === 'fr' ? 'Article' : 'News Article'
  if (type === 'resolution')        return locale === 'fr' ? 'Résolution' : 'Resolution'
  if (type === 'probability_shift') return locale === 'fr' ? 'Mouvement de probabilité' : 'Probability Shift'
  return locale === 'fr' ? 'Signal' : 'Signal'
}

export default async function SignalDetailPage({ params }: { params: { id: string } }) {
  const db = createAdminClient()
  const locale = getLocale()

  const { data: signal } = await db
    .from('forecast_signal_feed')
    .select(`
      id, signal_type, title, summary, severity, data, created_at,
      forecast_questions ( id, slug, title, blended_probability, description, close_date, status ),
      forecast_channels  ( id, slug, name, name_fr, name_en )
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (!signal) notFound()

  const s = signal as any
  const ch = s.forecast_channels
  const q  = s.forecast_questions
  const chColor = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400 border-neutral-700'
  const chName = ch ? localizeChannel(ch, locale) : null

  const sourceUrl       = s.data?.source_url     as string | undefined
  const imageUrl        = s.data?.image_url       as string | undefined
  const region          = s.data?.region          as string | undefined
  const sourceHint      = s.data?.source_hint     as string | undefined
  const articleBody     = s.data?.article_body     as string | undefined
  const articleAuthor   = s.data?.article_author   as string | undefined
  const articlePublished = s.data?.article_published as string | undefined
  const sevLabel = SEVERITY_LABELS[s.severity]?.[locale] ?? s.severity

  const dateStr = new Date(s.created_at).toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  )

  // Check if current user has bookmarked this signal
  let isBookmarked = false
  try {
    const sbUser = createClient()
    const { data: { user } } = await sbUser.auth.getUser()
    if (user) {
      const { data: bm } = await db
        .from('signal_bookmarks')
        .select('id')
        .eq('user_id', user.id)
        .eq('signal_id', s.id)
        .maybeSingle()
      isBookmarked = !!bm
    }
  } catch { /* not logged in */ }

  // Load related signals from the same channel
  const { data: relatedSignals } = ch
    ? await db
        .from('forecast_signal_feed')
        .select('id, title, signal_type, created_at, data')
        .eq('channel_id', ch.id)
        .neq('id', s.id)
        .order('created_at', { ascending: false })
        .limit(5)
    : { data: [] }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6 sm:py-10 space-y-6 overflow-x-hidden">
      {/* Back */}
      <Link href="/forecast/signals" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
        <ArrowLeft size={12} />
        {locale === 'fr' ? 'Retour aux signaux' : 'Back to signals'}
      </Link>

      {/* Image */}
      {imageUrl && (
        <div className="relative w-full h-48 sm:h-64 md:h-80 rounded-xl sm:rounded-2xl overflow-hidden bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-neutral-950/20" />
        </div>
      )}

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SignalTypeIcon type={s.signal_type} />
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300">
            {signalTypeLabel(s.signal_type, locale)}
          </span>
          {chName && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chColor}`}>
              {chName}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            s.severity === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
            s.severity === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}>
            {sevLabel}
          </span>
          {region && (
            <span className="text-[10px] text-neutral-500 flex items-center gap-1">
              <MapPin size={9} /> {region}
            </span>
          )}
        </div>

        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white leading-tight break-words">
          {s.title}
        </h1>

        {/* Actions: Follow + Share */}
        <div className="flex items-center gap-2">
          <BookmarkButton signalId={s.id} initialBookmarked={isBookmarked} locale={locale} />
          <ShareButton signalId={s.id} signalTitle={s.title} locale={locale} />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <Calendar size={11} /> {dateStr}
          </span>
          {sourceHint && (
            <span className="flex items-center gap-1">
              <Tag size={10} /> {sourceHint}
            </span>
          )}
          {articleAuthor && (
            <span>{locale === 'fr' ? 'Par' : 'By'} {articleAuthor}</span>
          )}
        </div>
      </div>

      {/* Summary */}
      {s.summary && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-5">
          <p className="text-sm sm:text-base text-neutral-300 leading-relaxed whitespace-pre-line">
            {s.summary}
          </p>
        </div>
      )}

      {/* Full article body if available */}
      {articleBody && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {locale === 'fr' ? 'Article complet' : 'Full article'}
          </h2>
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 sm:p-5">
            <div className="text-sm text-neutral-400 leading-relaxed whitespace-pre-line max-h-[600px] overflow-y-auto">
              {articleBody}
            </div>
          </div>
        </div>
      )}

      {/* Source link */}
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3"
        >
          <ExternalLink size={14} />
          {locale === 'fr' ? "Lire l'article source" : 'Read source article'}
        </a>
      )}

      {/* Linked question */}
      {q && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {locale === 'fr' ? 'Question liée' : 'Related question'}
          </h2>
          <Link
            href={`/forecast/q/${q.slug ?? q.id}`}
            className="block rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 hover:border-neutral-700 hover:bg-neutral-900/70 transition-all group"
          >
            <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-white transition-colors">
              {q.title}
            </h3>
            {q.description && (
              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{q.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-[10px] text-neutral-600">
              {q.blended_probability != null && (
                <span className="font-mono font-bold text-indigo-400">{Math.round(q.blended_probability * 100)}%</span>
              )}
              <span>{q.status}</span>
            </div>
          </Link>
        </div>
      )}

      {/* Related signals from same channel */}
      {(relatedSignals ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            {locale === 'fr' ? 'Articles similaires' : 'Related articles'}
          </h2>
          <div className="space-y-2">
            {(relatedSignals ?? []).map((rs: any) => (
              <Link
                key={rs.id}
                href={`/forecast/signals/${rs.id}`}
                className="flex items-start gap-3 rounded-lg border border-neutral-800/40 bg-neutral-900/30 p-3 hover:border-neutral-700 hover:bg-neutral-900/60 transition-all group"
              >
                {rs.data?.image_url && (
                  <div className="w-16 h-12 rounded-md overflow-hidden bg-neutral-800 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={rs.data.image_url} alt="" className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" loading="lazy" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-medium text-neutral-300 group-hover:text-white transition-colors line-clamp-2">
                    {rs.title}
                  </h4>
                  <span className="text-[10px] text-neutral-600 mt-0.5 block">
                    {new Date(rs.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
