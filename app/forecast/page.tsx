import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { ProbabilityGauge } from '@/components/forecast/ProbabilityGauge'
import { SignalCard } from '@/components/forecast/SignalCard'
import type { SignalData } from '@/components/forecast/SignalCard'
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
      .select('id, slug, title, close_date, forecast_count, blended_probability, crowd_probability, ai_probability, channel_id, forecast_channels(slug, name, name_fr, name_en)')
      .eq('featured', true).eq('status', 'open').order('close_date', { ascending: true }).limit(3),
    db.from('forecast_signal_feed')
      .select('id, signal_type, title, summary, severity, data, created_at, forecast_questions(id, slug, title, blended_probability), forecast_channels(id, slug, name, name_fr, name_en)')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const channelId = (channelResult as any)?.data?.id ?? null
  let questionQuery = db.from('forecast_questions')
    .select('id, slug, title, close_date, forecast_count, blended_probability, crowd_probability, ai_probability, channel_id, forecast_channels(slug, name, name_fr, name_en)')
    .eq('status', 'open').order('close_date', { ascending: true }).limit(24)
  if (channelId) questionQuery = questionQuery.eq('channel_id', channelId)

  const { data: questions } = await questionQuery
  const featured = featuredResult.data ?? []
  const liveSignals = (signalsResult.data ?? []) as SignalData[]

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
                <Link key={q.id} href={`/forecast/q/${q.slug ?? q.id}`}
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveSignals.map(s => (
              <SignalCard key={s.id} signal={s} locale={locale} compact />
            ))}
          </div>
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

      {/* Questions list */}
      <section className="space-y-3">
        {!questions?.length && (
          <div className="text-center py-20 text-neutral-600">
            {searchParams.channel ? tr(locale, 'page.no_questions_ch') : tr(locale, 'page.no_questions')}
          </div>
        )}
        {questions?.map(q => {
          const ch = (q as any).forecast_channels
          const chColor = CHANNEL_COLORS[ch?.slug ?? ''] ?? 'bg-neutral-800 text-neutral-400 border-neutral-700'
          const prob = q.blended_probability !== null ? Math.round(q.blended_probability * 100) : null
          return (
            <Link key={q.id} href={`/forecast/q/${q.slug ?? q.id}`}
              className="group flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/70 transition-all px-5 py-4">
              <div className="flex-shrink-0"><ProbabilityGauge value={prob} size={56} strokeWidth={6} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${chColor}`}>
                    {ch ? localizeChannel(ch, locale) : ''}
                  </span>
                  <span className="text-[10px] text-neutral-600">{daysLeft(q.close_date, locale)}</span>
                </div>
                <h3 className="text-sm font-semibold text-neutral-200 group-hover:text-white transition-colors line-clamp-2 leading-snug">{q.title}</h3>
              </div>
              <div className="flex-shrink-0 hidden sm:flex flex-col items-end gap-1.5 text-[10px]">
                {q.crowd_probability !== null && <span className="text-emerald-500 font-mono">{tr(locale, 'q.crowd')} {Math.round(q.crowd_probability * 100)}%</span>}
                {q.ai_probability    !== null && <span className="text-blue-400 font-mono">{tr(locale, 'q.ai')} {Math.round(q.ai_probability * 100)}%</span>}
                <span className="text-neutral-600 flex items-center gap-1"><Users size={9} />{q.forecast_count ?? 0}</span>
              </div>
              <ChevronRight size={14} className="text-neutral-700 group-hover:text-neutral-500 flex-shrink-0 transition-colors" />
            </Link>
          )
        })}
      </section>
    </div>
  )
}
