import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProbabilityGauge } from '@/components/forecast/ProbabilityGauge'
import { HistorySparkline } from '@/components/forecast/HistorySparkline'
import { SubmitForecastForm } from '@/components/forecast/SubmitForecastForm'
import { QuestionComments } from '@/components/forecast/QuestionComments'
import { ArrowLeft, Calendar, Users, Bot, ExternalLink, BookOpen, CheckCircle2 } from 'lucide-react'
import { getLocale } from '@/lib/i18n/server'
import { tr } from '@/lib/i18n/translations'
import { localizeChannel } from '@/lib/forecast/locale'

export const dynamic = 'force-dynamic'

const STATUS_COLORS: Record<string, string> = {
  open:         'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  paused:       'text-orange-400 bg-orange-500/10 border-orange-500/20',
  closed:       'text-amber-400 bg-amber-500/10 border-amber-500/20',
  resolved_yes: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  resolved_no:  'text-red-400 bg-red-500/10 border-red-500/20',
  annulled:     'text-neutral-400 bg-neutral-800 border-neutral-700',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isSafeQuestionParam(s: string) {
  return UUID_RE.test(s) || /^[a-z0-9-]{1,220}$/i.test(s)
}

export default async function ForecastQuestionPage({ params }: { params: { id: string } }) {
  const raw = params.id
  if (!isSafeQuestionParam(raw)) notFound()

  const db = createAdminClient()
  const sbUser = createClient()

  const isUuid = UUID_RE.test(raw)
  let qQuery = db
    .from('forecast_questions')
    .select('*, forecast_channels ( id, slug, name, name_fr, name_en ), forecast_events ( id, slug, title )')
    .neq('status', 'draft')
    .neq('status', 'paused')

  qQuery = isUuid ? qQuery.or(`id.eq.${raw},slug.eq.${raw}`) : qQuery.eq('slug', raw)

  const [{ data: { user } }, questionResult] = await Promise.all([
    sbUser.auth.getUser(),
    qQuery.maybeSingle(),
  ])

  if (!questionResult.data) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = questionResult.data as any

  // Étape 2 : forecast IA courant, historique, vote utilisateur
  const [{ data: aiData }, historyResult, userForecastResult] = await Promise.all([
    db
      .from('forecast_ai_forecasts')
      .select('probability, confidence, reasoning, model, created_at')
      .eq('question_id', q.id)
      .eq('is_current', true)
      .maybeSingle(),
    db
      .from('forecast_probability_history')
      .select('snapshot_at, crowd_probability, ai_probability, blended_probability')
      .eq('question_id', q.id)
      .order('snapshot_at', { ascending: true })
      .limit(60),
    user
      ? db
          .from('forecast_user_forecasts')
          .select('probability, revision')
          .eq('question_id', q.id)
          .eq('user_id', user.id)
          .eq('is_current', true)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const history = historyResult.data ?? []
  const userForecast = userForecastResult.data
    ? Math.round((userForecastResult.data as { probability: number }).probability * 100)
    : null

  const locale = getLocale()
  const ch = q.forecast_channels
  const aiReason = (aiData?.reasoning ?? null) as Record<string, unknown> | null
  const situationSummary = typeof aiReason?.summary === 'string' ? (aiReason.summary as string) : ''
  const statusColor = STATUS_COLORS[q.status] ?? STATUS_COLORS.closed
  const statusLabel = tr(locale, `status.${q.status}` as any) ?? q.status
  const crowdPct   = q.crowd_probability   !== null ? Math.round(q.crowd_probability   * 100) : null
  const aiPct      = q.ai_probability      !== null ? Math.round(q.ai_probability      * 100) : null
  const blendedPct = q.blended_probability !== null ? Math.round(q.blended_probability * 100) : null
  const dateFmt    = locale === 'fr' ? 'fr-FR' : 'en-GB'

  const imgUrl = typeof q.image_url === 'string' ? q.image_url : null

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <Link href="/forecast" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
        <ArrowLeft size={12} />{tr(locale, 'q.back')}
      </Link>

      {imgUrl && (
        <div className="relative w-full h-48 md:h-64 rounded-2xl overflow-hidden bg-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imgUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/70 via-transparent to-neutral-950/20" />
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {ch && <span className="text-xs font-semibold text-neutral-300 bg-neutral-800 px-2.5 py-0.5 rounded-full">{localizeChannel(ch, locale)}</span>}
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusColor}`}>{statusLabel}</span>
          <span className="text-xs text-neutral-600 flex items-center gap-1">
            <Calendar size={10} />{tr(locale, 'q.close_date')} : {new Date(q.close_date).toLocaleDateString(dateFmt, { day: '2-digit', month: 'long', year: 'numeric' })}
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">{q.title}</h1>
        {(q.description || situationSummary) && (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-3">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{tr(locale, 'q.situation')}</h2>
            {q.description && <p className="text-sm text-neutral-300 leading-relaxed">{q.description}</p>}
            {situationSummary && (
              <p className={`text-sm text-neutral-400 leading-relaxed ${q.description ? 'border-t border-neutral-800/80 pt-3' : ''}`}>
                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mr-2">{tr(locale, 'q.situation_ai')}</span>
                {situationSummary}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 flex flex-col items-center gap-2">
          <ProbabilityGauge value={crowdPct} size={100} label={tr(locale, 'q.crowd')} sublabel={`${q.forecast_count ?? 0} votes`} colorOverride="#34d399" />
        </div>
        <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-5 flex flex-col items-center gap-2">
          <ProbabilityGauge value={aiPct} size={100} label={tr(locale, 'q.ai')} sublabel={aiData?.model ?? 'Gemini'} colorOverride="#60a5fa" />
        </div>
        <div className="rounded-2xl border border-indigo-800/40 bg-indigo-950/20 p-5 flex flex-col items-center gap-2">
          <ProbabilityGauge value={blendedPct} size={100} label={tr(locale, 'q.blended')} sublabel={locale === 'fr' ? 'Agrégé' : 'Aggregated'} colorOverride="#818cf8" />
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-neutral-200">{tr(locale, 'q.history')}</h2>
              {history.length > 0 && (
                <div className="flex items-center gap-3 text-[10px] text-neutral-600">
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-400 inline-block" />{tr(locale, 'q.legend.crowd')}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-400 inline-block" />{tr(locale, 'q.legend.ai')}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-indigo-400 inline-block" />{tr(locale, 'q.legend.blended')}</span>
                </div>
              )}
            </div>
            <HistorySparkline data={history} locale={locale} emptyLabel={tr(locale, 'q.history_empty')} />
          </div>

          {aiReason && (() => {
            const R = aiReason as Record<string, any>
            const bulls = Array.isArray(R.bullish_factors) ? R.bullish_factors as string[] : []
            const bears = Array.isArray(R.bearish_factors) ? R.bearish_factors as string[] : []
            const unc = Array.isArray(R.key_uncertainties) ? R.key_uncertainties as string[] : []
            const sources = Array.isArray(R.sources) ? R.sources as { title?: string; url: string }[] : []
            const hasBlocks = bulls.length || bears.length || unc.length || R.next_catalyst || R.base_rate_note || sources.length
            if (!hasBlocks) return null
            return (
            <div className="rounded-2xl border border-blue-900/30 bg-blue-950/10 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-blue-400" />
                <h2 className="text-sm font-semibold text-blue-300">{tr(locale, 'q.analysis')}</h2>
                <span className="text-[10px] text-neutral-600 ml-auto">{aiData?.model} · {tr(locale, 'q.confidence')} {aiData?.confidence}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {bulls.length > 0 && <div><div className="text-xs font-semibold text-emerald-500 mb-2">{tr(locale, 'q.bullish')}</div><ul className="space-y-1">{bulls.map((f: string, i: number) => <li key={i} className="text-xs text-neutral-400 flex gap-1.5"><span className="text-emerald-600 flex-shrink-0">+</span>{f}</li>)}</ul></div>}
                {bears.length > 0 && <div><div className="text-xs font-semibold text-red-500 mb-2">{tr(locale, 'q.bearish')}</div><ul className="space-y-1">{bears.map((f: string, i: number) => <li key={i} className="text-xs text-neutral-400 flex gap-1.5"><span className="text-red-600 flex-shrink-0">−</span>{f}</li>)}</ul></div>}
              </div>
              {unc.length > 0 && <div><div className="text-xs font-semibold text-amber-500 mb-2">{tr(locale, 'q.uncertainties')}</div><ul className="space-y-1">{unc.map((u: string, i: number) => <li key={i} className="text-xs text-neutral-400 flex gap-1.5"><span className="text-amber-600 flex-shrink-0">?</span>{u}</li>)}</ul></div>}
              {R.next_catalyst && <div className="bg-neutral-900 rounded-xl px-4 py-3 border border-neutral-800"><span className="text-[10px] text-neutral-500 uppercase tracking-wider">{tr(locale, 'q.next_catalyst')}</span><p className="text-xs text-neutral-300 mt-1">{R.next_catalyst}</p></div>}
              {R.base_rate_note && <div className="text-xs text-neutral-500 italic border-t border-neutral-800 pt-3">{tr(locale, 'q.base_rate')} : {R.base_rate_note}</div>}
              {sources.length > 0 && <div><div className="text-[10px] text-neutral-600 mb-2 uppercase tracking-wider">{tr(locale, 'q.sources')}</div><div className="space-y-1">{sources.slice(0, 5).map((s, i: number) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"><ExternalLink size={9} className="flex-shrink-0" /><span className="truncate">{s.title || s.url}</span></a>)}</div></div>}
            </div>
            )
          })()}

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
            <div className="flex items-center gap-2"><BookOpen size={13} className="text-neutral-500" /><h2 className="text-sm font-semibold text-neutral-300">{tr(locale, 'q.resolution')}</h2></div>
            <p className="text-xs text-neutral-400 leading-relaxed">{q.resolution_criteria}</p>
            <div className="text-xs text-neutral-600">{tr(locale, 'q.source_lbl')} : {q.resolution_source}</div>
            {q.resolution_url && <a href={q.resolution_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><ExternalLink size={10} />{tr(locale, 'q.see_source')}</a>}
            {q.resolution_notes && <div className="border-t border-neutral-800 pt-3 text-xs text-neutral-400 italic">{tr(locale, 'q.notes')} : {q.resolution_notes}</div>}
          </div>
        </div>

        <div className="space-y-4">
          {user && userForecast !== null && (
            <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-300">{tr(locale, 'q.your_forecast')}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-emerald-300 font-mono">{userForecast}%</span>
              </div>
              <p className="text-[11px] text-emerald-700 mt-1">{tr(locale, 'q.your_forecast_hint')}</p>
            </div>
          )}

          {q.status === 'open' && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider px-1">{tr(locale, 'q.estimate_section')}</h2>
              <SubmitForecastForm questionId={q.id} currentUserProbability={userForecast} isAuthenticated={!!user} locale={locale} />
            </div>
          )}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-3">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">{tr(locale, 'q.stats')}</div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-neutral-500 flex items-center gap-1"><Users size={10} />{tr(locale, 'q.participants')}</span><span className="text-neutral-200 font-mono">{q.forecast_count ?? 0}</span></div>
              {crowdPct   !== null && <div className="flex justify-between text-xs"><span className="text-emerald-600">{tr(locale, 'q.crowd_prob')}</span><span className="text-emerald-400 font-mono font-semibold">{crowdPct}%</span></div>}
              {aiPct      !== null && <div className="flex justify-between text-xs"><span className="text-blue-600">{tr(locale, 'q.ai_prob')}</span><span className="text-blue-400 font-mono font-semibold">{aiPct}%</span></div>}
              {blendedPct !== null && <div className="flex justify-between text-xs border-t border-neutral-800 pt-2"><span className="text-indigo-400 font-semibold">{tr(locale, 'q.blended')}</span><span className="text-indigo-300 font-mono font-bold">{blendedPct}%</span></div>}
            </div>
          </div>
          {q.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{q.tags.map((tag: string) => <span key={tag} className="text-[10px] text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">#{tag}</span>)}</div>}
        </div>
      </div>

      <QuestionComments questionParam={raw} locale={locale} isAuthenticated={!!user} />
    </div>
  )
}