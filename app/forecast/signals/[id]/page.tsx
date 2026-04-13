import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Calendar, Tag, MapPin, Newspaper, TrendingUp, CheckCircle2, Zap, Globe, User, Clock, Network } from 'lucide-react'
import { getLocale } from '@/lib/i18n/server'
import { localizeChannel } from '@/lib/forecast/locale'
import { BookmarkButton, ShareButton } from '@/components/forecast/SignalActions'
import { createClient } from '@/lib/supabase/server'
import { SplitReaderLayout } from '@/components/forecast/reader/SplitReaderLayout'
import { LiveAnalysisLoader } from '@/components/forecast/reader/LiveAnalysisLoader'
import type { ArticleImplicationAnalysis } from '@/lib/forecast/mock-articles'

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

  const sourceUrl        = s.data?.source_url      as string | undefined
  const imageUrl         = s.data?.image_url        as string | undefined
  const region           = s.data?.region           as string | undefined
  const sourceHint       = s.data?.source_hint      as string | undefined
  const articleBody      = s.data?.article_body      as string | undefined
  const articleAuthor    = s.data?.article_author    as string | undefined
  const articlePublished = s.data?.article_published as string | undefined
  const articlePublisher = s.data?.article_publisher as string | undefined
  const sevLabel = SEVERITY_LABELS[s.severity]?.[locale] ?? s.severity

  const dateStr = new Date(s.created_at).toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  )

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

  const { data: relatedSignals } = ch
    ? await db
        .from('forecast_signal_feed')
        .select('id, title, signal_type, created_at, data')
        .eq('channel_id', ch.id)
        .neq('id', s.id)
        .order('created_at', { ascending: false })
        .limit(5)
    : { data: [] }

  const hasBody = !!articleBody
  const displayText = articleBody ?? s.summary ?? ''
  const publisherName = articlePublisher ?? sourceHint ?? 'Source'

  const emptyAnalysis: ArticleImplicationAnalysis = {
    articleId: s.id,
    executiveTakeaway: '',
    whyThisMatters: [],
    immediateImplications: [],
    secondOrderEffects: [],
    regionalImplications: [],
    sectorExposure: [],
    whatToWatch: [],
    relatedForecasts: [],
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LEFT PANE — Article reading
  // ═══════════════════════════════════════════════════════════════════════════
  const leftPane = (
    <article className="space-y-6">
      {/* Back link */}
      <Link href="/forecast/signals" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
        <ArrowLeft size={12} />
        {locale === 'fr' ? 'Retour aux signaux' : 'Back to signals'}
      </Link>

      {/* Publisher attribution */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center flex-shrink-0">
            <Globe size={14} className="text-neutral-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-100">{publisherName}</span>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {locale === 'fr' ? 'Source originale' : 'Original source'}
              </span>
            </div>
            {sourceUrl && (
              <span className="text-[10px] text-neutral-600">
                {(() => { try { return new URL(sourceUrl).hostname } catch { return '' } })()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap text-[11px] text-neutral-500">
          {articleAuthor && (
            <span className="flex items-center gap-1"><User size={10} />{articleAuthor}</span>
          )}
          <span className="flex items-center gap-1"><Clock size={10} />{dateStr}</span>
          {region && (
            <span className="flex items-center gap-1"><MapPin size={9} />{region}</span>
          )}
        </div>

        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2"
          >
            <ExternalLink size={12} />
            {locale === 'fr' ? `Lire sur ${publisherName}` : `Read on ${publisherName}`}
          </a>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      {/* Image */}
      {imageUrl && (
        <div className="relative rounded-xl overflow-hidden bg-neutral-800 aspect-[16/9]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={s.title} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      {/* Title */}
      <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight tracking-tight">
        {s.title}
      </h1>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <BookmarkButton signalId={s.id} initialBookmarked={isBookmarked} locale={locale} />
        <ShareButton signalId={s.id} signalTitle={s.title} locale={locale} />
        <Link
          href={`/forecast/graph?articleId=${s.id}`}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 transition-colors"
        >
          <Network size={13} />
          {locale === 'fr' ? 'Construire Storyline' : 'Build Storyline'}
        </Link>
      </div>

      {/* Content indicator */}
      {hasBody ? (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 px-4 py-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          <p className="text-[11px] font-medium text-emerald-400/80">
            {locale === 'fr'
              ? 'Article complet disponible — l\'analyse IA est basée sur le contenu intégral'
              : 'Full article available — AI analysis is based on the complete content'}
          </p>
        </div>
      ) : s.summary ? (
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-4 py-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <p className="text-[11px] font-medium text-amber-400/80">
            {locale === 'fr'
              ? 'Extrait de la source — l\'analyse IA est limitée au résumé disponible'
              : 'Source excerpt — AI analysis is limited to the available summary'}
          </p>
        </div>
      ) : null}

      {/* Article body */}
      <div className="prose-custom">
        {displayText.split('\n\n').map((paragraph: string, i: number) => (
          <p key={i} className="text-sm text-neutral-300 leading-[1.8] mb-4">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Linked question */}
      {q && (
        <div className="space-y-2 border-t border-neutral-800 pt-5">
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

      {/* Related signals */}
      {(relatedSignals ?? []).length > 0 && (
        <div className="space-y-3 border-t border-neutral-800 pt-5">
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

      {/* Bottom attribution */}
      <div className="border-t border-neutral-800 pt-5">
        <p className="text-[10px] text-neutral-600 leading-relaxed">
          {locale === 'fr'
            ? `Contenu publié par ${publisherName}. Affiché avec attribution à la source à des fins d'analyse.`
            : `Content published by ${publisherName}. Displayed with source attribution for analysis purposes.`}
        </p>
      </div>
    </article>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  //  RIGHT PANE — AI Analysis
  // ═══════════════════════════════════════════════════════════════════════════
  const rightPane = (
    <LiveAnalysisLoader
      signalId={s.id}
      locale={locale}
      fallbackAnalysis={emptyAnalysis}
    />
  )

  return (
    <SplitReaderLayout
      leftPane={leftPane}
      rightPane={rightPane}
      locale={locale}
    />
  )
}
