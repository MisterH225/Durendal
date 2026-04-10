import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ProbabilityGauge } from '@/components/forecast/ProbabilityGauge'
import { HistorySparkline } from '@/components/forecast/HistorySparkline'
import { SubmitForecastForm } from '@/components/forecast/SubmitForecastForm'
import { ArrowLeft, Calendar, Users, Bot, ExternalLink, BookOpen } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open:         { label: 'Ouverte',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  closed:       { label: 'Fermée',     color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  resolved_yes: { label: 'Résolu OUI', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  resolved_no:  { label: 'Résolu NON', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  annulled:     { label: 'Annulé',     color: 'text-neutral-400 bg-neutral-800 border-neutral-700' },
}

export default async function ForecastQuestionPage({ params }: { params: { id: string } }) {
  const db = createAdminClient()
  const sbUser = createClient()

  const [{ data: { user } }, questionResult] = await Promise.all([
    sbUser.auth.getUser(),
    db.from('forecast_questions').select('*, forecast_channels ( id, slug, name ), forecast_events ( id, slug, title ), forecast_ai_forecasts ( probability, confidence, reasoning, model, created_at )').or(`id.eq.${params.id},slug.eq.${params.id}`).eq('forecast_ai_forecasts.is_current', true).neq('status', 'draft').maybeSingle(),
  ])

  if (!questionResult.data) notFound()
  const q = questionResult.data

  // Must use q.id (UUID) — params.id may be a slug, which is not a valid question_id FK
  const { data: historyData } = await db
    .from('forecast_probability_history')
    .select('snapshot_at, crowd_probability, ai_probability, blended_probability')
    .eq('question_id', q.id)
    .order('snapshot_at', { ascending: true })
    .limit(60)

  const history = historyData ?? []

  let userForecast: number | null = null
  if (user) {
    const { data: uf } = await db.from('forecast_user_forecasts').select('probability').eq('question_id', q.id).eq('user_id', user.id).eq('is_current', true).maybeSingle()
    userForecast = uf ? Math.round(uf.probability * 100) : null
  }

  const ch = (q as any).forecast_channels
  const aiData = (q as any).forecast_ai_forecasts?.[0] ?? null
  const aiReason = aiData?.reasoning as Record<string, any> | null
  const statusMeta = STATUS_LABELS[q.status] ?? STATUS_LABELS.closed
  const crowdPct   = q.crowd_probability   !== null ? Math.round(q.crowd_probability   * 100) : null
  const aiPct      = q.ai_probability      !== null ? Math.round(q.ai_probability      * 100) : null
  const blendedPct = q.blended_probability !== null ? Math.round(q.blended_probability * 100) : null

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <Link href="/forecast" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"><ArrowLeft size={12} />Retour aux questions</Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {ch && <span className="text-xs font-semibold text-neutral-300 bg-neutral-800 px-2.5 py-0.5 rounded-full">{ch.name}</span>}
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.color}`}>{statusMeta.label}</span>
          <span className="text-xs text-neutral-600 flex items-center gap-1"><Calendar size={10} />Clôture : {new Date(q.close_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">{q.title}</h1>
        {q.description && <p className="text-sm text-neutral-400 leading-relaxed">{q.description}</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 flex flex-col items-center gap-2"><ProbabilityGauge value={crowdPct} size={100} label="Foule" sublabel={`${q.forecast_count ?? 0} votes`} colorOverride="#34d399" /></div>
        <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-5 flex flex-col items-center gap-2"><ProbabilityGauge value={aiPct} size={100} label="IA" sublabel={aiData?.model ?? 'Gemini'} colorOverride="#60a5fa" /></div>
        <div className="rounded-2xl border border-indigo-800/40 bg-indigo-950/20 p-5 flex flex-col items-center gap-2"><ProbabilityGauge value={blendedPct} size={100} label="Blended" sublabel="Agrégé" colorOverride="#818cf8" /></div>
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          {history.length > 0 && (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-neutral-200">Historique de probabilité</h2>
                <div className="flex items-center gap-3 text-[10px] text-neutral-600">
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-400 inline-block" />Crowd</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-400 inline-block" />IA</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-indigo-400 inline-block" />Blended</span>
                </div>
              </div>
              <HistorySparkline data={history} />
            </div>
          )}

          {aiReason && (
            <div className="rounded-2xl border border-blue-900/30 bg-blue-950/10 p-5 space-y-4">
              <div className="flex items-center gap-2"><Bot size={14} className="text-blue-400" /><h2 className="text-sm font-semibold text-blue-300">Analyse IA</h2><span className="text-[10px] text-neutral-600 ml-auto">{aiData?.model} · confiance {aiData?.confidence}</span></div>
              {aiReason.summary && <p className="text-sm text-neutral-300 leading-relaxed">{aiReason.summary}</p>}
              <div className="grid sm:grid-cols-2 gap-4">
                {aiReason.bullish_factors?.length > 0 && <div><div className="text-xs font-semibold text-emerald-500 mb-2">Facteurs haussiers</div><ul className="space-y-1">{aiReason.bullish_factors.map((f: string, i: number) => <li key={i} className="text-xs text-neutral-400 flex gap-1.5"><span className="text-emerald-600 flex-shrink-0">+</span>{f}</li>)}</ul></div>}
                {aiReason.bearish_factors?.length > 0 && <div><div className="text-xs font-semibold text-red-500 mb-2">Facteurs baissiers</div><ul className="space-y-1">{aiReason.bearish_factors.map((f: string, i: number) => <li key={i} className="text-xs text-neutral-400 flex gap-1.5"><span className="text-red-600 flex-shrink-0">−</span>{f}</li>)}</ul></div>}
              </div>
              {aiReason.key_uncertainties?.length > 0 && <div><div className="text-xs font-semibold text-amber-500 mb-2">Incertitudes clés</div><ul className="space-y-1">{aiReason.key_uncertainties.map((u: string, i: number) => <li key={i} className="text-xs text-neutral-400 flex gap-1.5"><span className="text-amber-600 flex-shrink-0">?</span>{u}</li>)}</ul></div>}
              {aiReason.next_catalyst && <div className="bg-neutral-900 rounded-xl px-4 py-3 border border-neutral-800"><span className="text-[10px] text-neutral-500 uppercase tracking-wider">Prochain catalyseur</span><p className="text-xs text-neutral-300 mt-1">{aiReason.next_catalyst}</p></div>}
              {aiReason.base_rate_note && <div className="text-xs text-neutral-500 italic border-t border-neutral-800 pt-3">Base rate : {aiReason.base_rate_note}</div>}
              {aiReason.sources?.length > 0 && <div><div className="text-[10px] text-neutral-600 mb-2 uppercase tracking-wider">Sources analysées</div><div className="space-y-1">{aiReason.sources.slice(0, 5).map((s: { title: string; url: string }, i: number) => <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 transition-colors"><ExternalLink size={9} className="flex-shrink-0" /><span className="truncate">{s.title || s.url}</span></a>)}</div></div>}
            </div>
          )}

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 space-y-3">
            <div className="flex items-center gap-2"><BookOpen size={13} className="text-neutral-500" /><h2 className="text-sm font-semibold text-neutral-300">Critères de résolution</h2></div>
            <p className="text-xs text-neutral-400 leading-relaxed">{q.resolution_criteria}</p>
            <div className="text-xs text-neutral-600">Source : {q.resolution_source}</div>
            {q.resolution_url && <a href={q.resolution_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"><ExternalLink size={10} />Voir la source</a>}
            {q.resolution_notes && <div className="border-t border-neutral-800 pt-3 text-xs text-neutral-400 italic">Note : {q.resolution_notes}</div>}
          </div>
        </div>

        <div className="space-y-4">
          {q.status === 'open' && <SubmitForecastForm questionId={q.id} currentUserProbability={userForecast} isAuthenticated={!!user} />}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-3">
            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Statistiques</div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-neutral-500 flex items-center gap-1"><Users size={10} />Participants</span><span className="text-neutral-200 font-mono">{q.forecast_count ?? 0}</span></div>
              {crowdPct !== null && <div className="flex justify-between text-xs"><span className="text-emerald-600">Prob. foule</span><span className="text-emerald-400 font-mono font-semibold">{crowdPct}%</span></div>}
              {aiPct    !== null && <div className="flex justify-between text-xs"><span className="text-blue-600">Prob. IA</span><span className="text-blue-400 font-mono font-semibold">{aiPct}%</span></div>}
              {blendedPct !== null && <div className="flex justify-between text-xs border-t border-neutral-800 pt-2"><span className="text-indigo-400 font-semibold">Blended</span><span className="text-indigo-300 font-mono font-bold">{blendedPct}%</span></div>}
            </div>
          </div>
          {q.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{q.tags.map((tag: string) => <span key={tag} className="text-[10px] text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-full">#{tag}</span>)}</div>}
        </div>
      </div>
    </div>
  )
}
