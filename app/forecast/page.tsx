import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ProbabilityGauge } from '@/components/forecast/ProbabilityGauge'
import { BlendedMicroSpark } from '@/components/forecast/BlendedMicroSpark'
import { SignalCarousel } from '@/components/forecast/SignalCarousel'
import { Calendar, Users, TrendingUp, ChevronRight, Radio } from 'lucide-react'
import { getLocale } from '@/lib/i18n/server'
import { tr } from '@/lib/i18n/translations'
import { localizeChannel } from '@/lib/forecast/locale'

export const dynamic = 'force-dynamic'

const CHANNEL_COLORS: Record<string, string> = {
  'macro-commodities':       'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'politics-policy':         'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'tech-ai':                 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'agriculture-risk':        'bg-green-500/10 text-green-400 border-green-500/20',
  'climate':                 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'logistics':               'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'regional-business-events':'bg-purple-500/10 text-purple-400 border-purple-500/20',
}

function daysLeft(closeDate: string, locale: ReturnType<typeof getLocale>) {
  const d = Math.ceil((new Date(closeDate).getTime() - Date.now()) / 86_400_000)
  if (d < 0) return tr(locale, 'days.closed')
  if (d === 0) return tr(locale, 'days.today')
  if (d === 1) return tr(locale, 'days.tomorrow')
  return `${tr(locale, 'days.left')}${d}`
}

export default async function ForecastPage({ searchParams }: { searchParams: { channel?: string } }) {
  const db = createAdminClient()
  const locale = getLocale()

  const [{ data: channels }, channelResult, featuredResult, signalsResult] = await Promise.all([
    db.from('forecast_channels').select('id, slug, name, name_fr, name_en').eq('is_active', true).order('sort_order'),
    searchParams.channel
      ? db.from('forecast_channels').select('id').eq('slug', searchParams.channel).single()
      : Promise.resolve({ data: null }),
    db.from('forecast_questions')
      .select('id, slug, title, description, close_date, forecast_count, blended_probability, crowd_probability, ai_probability, channel_id, forecast_channels(slug, name, name_fr, name_en)')
      .eq('featured', true).eq('status', 'open').order('close_date', { ascending: true }).limit(3),
    db.from('forecast_signal_feed')
      .select('id, signal_type, title, summary, severity, data, created_at, forecast_questions(id, slug, title, blended_probability), forecast_channels(id, slug, name, name_fr, name_en)')
      .gte('created_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const channelId = (channelResult as any)?.data?.id ?? null
  let questionQuery = db.from('forecast_questions')
    .select('id, slug, title, description, close_date, forecast_count, blended_probability, crowd_probability, ai_probability, channel_id, image_url, forecast_channels(slug, name, name_fr, name_en)')
    .eq('status', 'open').order('close_date', { ascending: true }).limit(24)
  if (channelId) questionQuery = questionQuery.eq('channel_id', channelId)

  const { data: questions } = await questionQuery
  const qList = questions ?? []
  const qIds = qList.map(q => q.id)

  type AiCard = { aiPct: number | null; summary: string | null }
  const aiByQuestion = new Map<string, AiCard>()
  const histByQuestion = new Map<string, (number | null)[]>()

  if (qIds.length) {
    const [aiRes, histRes] = await Promise.all([
      db.from('forecast_ai_forecasts').select('question_id, probability, reasoning').eq('is_current', true).in('question_id', qIds),
      db.from('forecast_probability_history').select('question_id, snapshot_at, blended_probability').in('question_id', qIds).order('snapshot_at', { ascending: true }).limit(900),
    ])
    for (const row of aiRes.data ?? []) {
      const reasoning = row.reasoning as Record<string, unknown> | null
      const summary = typeof reasoning?.summary === 'string' ? (reasoning.summary as string) : null
      aiByQuestion.set(row.question_id, {
        aiPct: row.probability != null ? Math.round(Number(row.probability) * 100) : null,
        summary,
      })
    }
    const buckets = new Map<string, { blended_probability: number | null }[]>()
    for (const row of histRes.data ?? []) {
      const arr = buckets.get(row.question_id) ?? []
      arr.push({ blended_probability: row.blended_probability })
      buckets.set(row.question_id, arr)
    }
    for (const id of qIds) {
      const full = buckets.get(id) ?? []
      histByQuestion.set(id, full.slice(-18).map(h => h.blended_probability))
    }
  }

  const featured = featuredResult.data ?? []
  const liveSignals = signalsResult.data ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">
      {/* Hero */}
      <div className="text-center space-y-3 pt-4">
        <div className="inline-flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
          <TrendingUp size={11} />
          {tr(locale, 'hero.badge')}
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{tr(locale, 'hero.title')}</h1>
        <p className="text-neutral-400 text-base max-w-xl mx-auto">{tr(locale, 'hero.subtitle')}</p>
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">{tr(locale, 'page.featured')}</span>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {featured.map(q => {
              const ch = (q as any).forecast_channels
              const chColor = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400 border-neutral-700'
              return (
                <Link key={q.id} href={`/forecast/q/${encodeURIComponent(q.slug ?? q.id)}`}
                  className="group rounded-2xl border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 hover:bg-neutral-900 transition-all p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chColor}`}>
                      {ch ? localizeChannel(ch, locale) : ''}
                    </span>
                    <span className="text-[10px] text-neutral-600">{daysLeft(q.close_date, locale)}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-neutral-100 leading-snug group-hover:text-white transition-colors line-clamp-3">{q.title}</h3>
                  <div className="flex items-center justify-between">
                    <ProbabilityGauge value={q.blended_probability !== null ? Math.round(q.blended_probability * 100) : null} size={72} strokeWidth={7} />
                    <div className="text-right space-y-1">
                      <div className="text-[10px] text-neutral-600 flex items-center gap-1 justify-end"><Users size={9} />{q.forecast_count ?? 0} votes</div>
                      <div className="text-[10px] text-neutral-600 flex items-center gap-1 justify-end"><Calendar size={9} />{new Date(q.close_date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' })}</div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Live Signals */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Radio size={13} className="text-red-400 animate-pulse" />
              <h2 className="text-base font-bold text-white">{tr(locale, 'signals.section_title')}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                {tr(locale, 'signals.live_badge')}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{tr(locale, 'signals.section_sub')}</p>
          </div>
          <Link
            href="/forecast/signals"
            className="flex-shrink-0 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            {tr(locale, 'signals.view_all')}
          </Link>
        </div>

        {liveSignals.length > 0 ? (
          <SignalCarousel signals={liveSignals as any} locale={locale} />
        ) : (
          <div className="rounded-2xl border border-dashed border-neutral-800 py-12 text-center text-neutral-600 text-sm">
            {tr(locale, 'signals.empty')}
          </div>
        )}
      </section>

      {/* Channel chips */}
      <div className="flex flex-wrap gap-2">
        <Link href="/forecast"
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${!searchParams.channel ? 'bg-white text-neutral-900 border-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'}`}>
          {tr(locale, 'page.all')}
        </Link>
        {channels?.map(ch => (
          <Link key={ch.id} href={`/forecast?channel=${ch.slug}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${searchParams.channel === ch.slug ? 'bg-white text-neutral-900 border-white' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200'}`}>
            {localizeChannel(ch, locale)}
          </Link>
        ))}
      </div>

      {/* Questions — cartes */}
      <section className="space-y-4">
        {!qList.length && (
          <div className="text-center py-20 text-neutral-600">
            {searchParams.channel ? tr(locale, 'page.no_questions_ch') : tr(locale, 'page.no_questions')}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          {qList.map(q => {
            const ch = (q as { forecast_channels?: { slug?: string; name?: string; name_fr?: string; name_en?: string } }).forecast_channels
            const chColor = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400 border-neutral-700'
            const blended = q.blended_probability !== null ? Math.round(q.blended_probability * 100) : null
            const aiCard = aiByQuestion.get(q.id)
            const aiPct = aiCard?.aiPct ?? (q.ai_probability != null ? Math.round(q.ai_probability * 100) : null)
            const snippet = (aiCard?.summary ?? (q as any).description ?? '').replace(/\s+/g, ' ').trim().slice(0, 340)
            const histVals = histByQuestion.get(q.id) ?? []
            const href = `/forecast/q/${encodeURIComponent(q.slug ?? q.id)}`
            const imgUrl = (q as any).image_url as string | null
            return (
              <Link key={q.id} href={href}
                className="group flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900/80 transition-all overflow-hidden min-h-[200px]">
                {imgUrl && (
                  <div className="relative h-36 w-full overflow-hidden bg-neutral-800 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imgUrl} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />
                    <div className="absolute top-2 left-2 flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border backdrop-blur-sm ${chColor}`}>
                        {ch ? localizeChannel(ch, locale) : ''}
                      </span>
                      <span className="text-[10px] text-neutral-300/80 backdrop-blur-sm bg-neutral-950/40 px-1.5 py-0.5 rounded">{daysLeft(q.close_date, locale)}</span>
                    </div>
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  {!imgUrl && (
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chColor}`}>
                          {ch ? localizeChannel(ch, locale) : ''}
                        </span>
                        <span className="text-[10px] text-neutral-600">{daysLeft(q.close_date, locale)}</span>
                      </div>
                      <ChevronRight size={16} className="text-neutral-600 group-hover:text-neutral-400 flex-shrink-0 transition-colors" />
                    </div>
                  )}
                  <h3 className="text-sm font-semibold text-neutral-100 group-hover:text-white transition-colors line-clamp-3 leading-snug mb-3">{q.title}</h3>
                  {snippet && (
                    <p className="text-xs text-neutral-500 line-clamp-4 leading-relaxed mb-4 flex-1">{snippet}</p>
                  )}
                  <div className="mt-auto pt-3 border-t border-neutral-800/80 space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <ProbabilityGauge value={blended} size={64} strokeWidth={6} colorOverride="#818cf8" />
                        <div className="text-[9px] text-neutral-600 mt-1 uppercase tracking-wide">{tr(locale, 'q.blended')}</div>
                      </div>
                      <div className="text-center">
                        <ProbabilityGauge value={aiPct} size={64} strokeWidth={6} colorOverride="#60a5fa" />
                        <div className="text-[9px] text-blue-500/80 mt-1 uppercase tracking-wide">{tr(locale, 'q.ai')}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[10px] text-neutral-500">
                      <span className="flex items-center gap-1"><Users size={10} />{q.forecast_count ?? 0}</span>
                      <span className="text-neutral-600">{new Date(q.close_date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  </div>
                  {histVals.length >= 2 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-neutral-600 uppercase tracking-wide">{tr(locale, 'page.trend')}</span>
                      <BlendedMicroSpark values={histVals} className="opacity-90" />
                    </div>
                  )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
