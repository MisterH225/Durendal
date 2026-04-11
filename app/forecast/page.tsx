import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ProbabilityGauge } from '@/components/forecast/ProbabilityGauge'
import { SignalFeedVertical } from '@/components/forecast/SignalFeedVertical'
import { TrendingCard } from '@/components/forecast/TrendingCard'
import { QuickVoteSlider } from '@/components/forecast/QuickVoteSlider'
import { Calendar, Users, TrendingUp, Radio, ChevronRight } from 'lucide-react'
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

  const [{ data: channels }, channelResult, signalsResult] = await Promise.all([
    db.from('forecast_channels').select('id, slug, name, name_fr, name_en').eq('is_active', true).order('sort_order'),
    searchParams.channel
      ? db.from('forecast_channels').select('id').eq('slug', searchParams.channel).single()
      : Promise.resolve({ data: null }),
    db.from('forecast_signal_feed')
      .select('id, signal_type, title, summary, severity, data, created_at, forecast_questions(id, slug, title, blended_probability), forecast_channels(id, slug, name, name_fr, name_en)')
      .gte('created_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  const channelId = (channelResult as any)?.data?.id ?? null
  let questionQuery = db.from('forecast_questions')
    .select('id, slug, title, description, close_date, forecast_count, blended_probability, crowd_probability, ai_probability, channel_id, image_url, forecast_channels(slug, name, name_fr, name_en)')
    .eq('status', 'open').order('close_date', { ascending: true }).limit(30)
  if (channelId) questionQuery = questionQuery.eq('channel_id', channelId)

  const { data: questions } = await questionQuery
  const qList = questions ?? []
  const qIds = qList.map(q => q.id)

  type AiCard = { aiPct: number | null; summary: string | null }
  const aiByQuestion = new Map<string, AiCard>()
  type HistPoint = { snapshot_at: string; blended_probability: number | null; crowd_probability: number | null; ai_probability: number | null }
  const histByQuestion = new Map<string, HistPoint[]>()

  if (qIds.length) {
    const [aiRes, histRes] = await Promise.all([
      db.from('forecast_ai_forecasts').select('question_id, probability, reasoning').eq('is_current', true).in('question_id', qIds),
      db.from('forecast_probability_history').select('question_id, snapshot_at, blended_probability, crowd_probability, ai_probability').in('question_id', qIds).order('snapshot_at', { ascending: true }).limit(1500),
    ])
    for (const row of aiRes.data ?? []) {
      const reasoning = row.reasoning as Record<string, unknown> | null
      const summary = typeof reasoning?.summary === 'string' ? (reasoning.summary as string) : null
      aiByQuestion.set(row.question_id, {
        aiPct: row.probability != null ? Math.round(Number(row.probability) * 100) : null,
        summary,
      })
    }
    for (const row of histRes.data ?? []) {
      const arr = histByQuestion.get(row.question_id) ?? []
      arr.push(row as HistPoint)
      histByQuestion.set(row.question_id, arr)
    }
  }

  const liveSignals = signalsResult.data ?? []

  // Pick the "trending" question: most votes, or highest blended, or first featured
  const trendingQ = [...qList].sort((a, b) => {
    const aScore = (a.forecast_count ?? 0) * 10 + (a.blended_probability != null ? Math.abs(a.blended_probability - 0.5) * 100 : 0)
    const bScore = (b.forecast_count ?? 0) * 10 + (b.blended_probability != null ? Math.abs(b.blended_probability - 0.5) * 100 : 0)
    return bScore - aScore
  })[0] ?? null

  const trendingData = trendingQ ? {
    id: trendingQ.id,
    slug: trendingQ.slug,
    title: trendingQ.title,
    description: (trendingQ as any).description,
    close_date: trendingQ.close_date,
    blended_probability: trendingQ.blended_probability,
    ai_probability: trendingQ.ai_probability,
    crowd_probability: trendingQ.crowd_probability,
    forecast_count: trendingQ.forecast_count ?? 0,
    channel_slug: (trendingQ as any).forecast_channels?.slug ?? '',
    channel_name: (trendingQ as any).forecast_channels ? localizeChannel((trendingQ as any).forecast_channels, locale) : '',
    image_url: (trendingQ as any).image_url,
    history: histByQuestion.get(trendingQ.id) ?? [],
    aiSummary: aiByQuestion.get(trendingQ.id)?.summary ?? null,
    commentCount: 0,
  } : null

  const restQuestions = qList.filter(q => q.id !== trendingQ?.id)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Hero compact */}
      <div className="text-center space-y-2 pt-2 pb-4">
        <div className="inline-flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
          <TrendingUp size={11} />
          {tr(locale, 'hero.badge')}
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">{tr(locale, 'hero.title')}</h1>
        <p className="text-neutral-400 text-sm max-w-xl mx-auto">{tr(locale, 'hero.subtitle')}</p>
      </div>

      {/* Channel chips — right below subtitle */}
      <div className="flex flex-wrap justify-center gap-2 pb-6">
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

      {/* Two-panel layout */}
      <div className="flex gap-5">

        {/* Left panel: live signals feed (vertical scroll) */}
        <aside className="hidden lg:block w-72 flex-shrink-0">
          <div className="sticky top-20">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={12} className="text-red-400 animate-pulse" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">{tr(locale, 'page.signals_feed')}</h2>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                {tr(locale, 'signals.live_badge')}
              </span>
            </div>
            <div className="max-h-[calc(100vh-10rem)] overflow-y-auto pr-1 space-y-0" style={{ scrollbarWidth: 'thin', scrollbarColor: '#262626 transparent' }}>
              <SignalFeedVertical signals={liveSignals as any} locale={locale} />
            </div>
            <Link
              href="/forecast/signals"
              className="flex items-center gap-1 mt-3 text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              {tr(locale, 'signals.view_all')}
            </Link>
          </div>
        </aside>

        {/* Right panel: trending card + question grid */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Trending card */}
          {trendingData && (
            <TrendingCard q={trendingData} locale={locale} />
          )}

          {/* Mobile signals (visible on small screens) */}
          <div className="lg:hidden">
            <div className="flex items-center gap-2 mb-3">
              <Radio size={12} className="text-red-400 animate-pulse" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">{tr(locale, 'page.signals_feed')}</h2>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                {tr(locale, 'signals.live_badge')}
              </span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <SignalFeedVertical signals={(liveSignals as any).slice(0, 6)} locale={locale} />
            </div>
          </div>

          {/* Open questions header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">{tr(locale, 'page.open_questions')}</h2>
            <span className="text-[10px] text-neutral-600">{restQuestions.length} {locale === 'fr' ? 'questions' : 'questions'}</span>
          </div>

          {/* Compact question cards */}
          {!restQuestions.length && (
            <div className="text-center py-12 text-neutral-600 text-sm">
              {searchParams.channel ? tr(locale, 'page.no_questions_ch') : tr(locale, 'page.no_questions')}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {restQuestions.map(q => {
              const ch = (q as { forecast_channels?: { slug?: string; name?: string; name_fr?: string; name_en?: string } }).forecast_channels
              const chColor = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400 border-neutral-700'
              const blended = q.blended_probability !== null ? Math.round(q.blended_probability * 100) : null
              const href = `/forecast/q/${encodeURIComponent(q.slug ?? q.id)}`

              return (
                <div key={q.id}
                  className="group flex flex-col rounded-xl border border-neutral-800/60 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/70 transition-all p-3.5 gap-2.5">

                  {/* Top: channel + days left */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${chColor}`}>
                      {ch ? localizeChannel(ch, locale) : ''}
                    </span>
                    <span className="text-[9px] text-neutral-600">{daysLeft(q.close_date, locale)}</span>
                  </div>

                  {/* Title (clickable → detail page) */}
                  <Link href={href} className="flex-1 min-h-0">
                    <h3 className="text-xs font-semibold text-neutral-200 group-hover:text-white transition-colors line-clamp-2 leading-snug">
                      {q.title}
                    </h3>
                  </Link>

                  {/* Gauge + participants */}
                  <div className="flex items-end justify-between pt-2 border-t border-neutral-800/50">
                    <div className="text-center">
                      <ProbabilityGauge value={blended} size={56} strokeWidth={5} />
                      <div className="text-[8px] text-neutral-500 mt-0.5">{locale === 'fr' ? 'Probabilité' : 'Probability'}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-[9px] text-neutral-500 pb-1">
                      <span className="flex items-center gap-1 font-medium"><Users size={10} />{q.forecast_count ?? 0} {locale === 'fr' ? 'avis' : 'votes'}</span>
                      <span className="text-neutral-600">{new Date(q.close_date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  </div>

                  {/* Quick vote slider */}
                  <div className="pt-2 border-t border-neutral-800/50">
                    <QuickVoteSlider questionId={q.id} locale={locale} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
