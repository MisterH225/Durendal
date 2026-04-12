import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Building2, Swords, TrendingUp,
  AlertTriangle, ListChecks, Link2, ArrowUpRight, ArrowDownRight,
  Minus, Shield, Target, Clock, Zap, Map, BarChart3, Route,
  Handshake, CircleAlert, Layers, Crosshair, ChevronRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function fmtDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function cleanSummary(raw: string): string {
  return raw.replace(/```(?:json)?\s*\n?/g, '').replace(/```\n?/g, '').replace(/^\s*\{[\s\S]*?\}\s*$/g, '').trim()
}

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>
}

export default async function WatchReportPage({ params }: { params: { id: string; reportId: string } }) {
  const supabase = createClient()
  const { data: watch } = await supabase.from('watches').select('id, name').eq('id', params.id).single()
  if (!watch) notFound()
  const { data: report, error } = await supabase.from('reports').select('*').eq('id', params.reportId).eq('watch_id', params.id).maybeSingle()
  if (error || !report) notFound()

  const c = (report.content ?? {}) as any
  const rawSummary = report.summary ?? c.executive_summary ?? ''
  const summary = typeof rawSummary === 'string' && rawSummary.includes('```') ? cleanSummary(rawSummary) : rawSummary
  const title = report.title ?? c.title ?? 'Rapport de veille'
  const generated = fmtDate(report.generated_at) ?? fmtDate(c.generated_at) ?? null
  const hasNewFormat = !!c.company_analyses?.length || !!c.competitive_comparison
  const hasLegacy = !hasNewFormat && !!c.key_insights?.length
  const card = 'rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 mb-4'

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-6">
      {/* Header */}
      <Link href={`/forecast/veille/watches/${params.id}`} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-4">
        <ArrowLeft size={12} /> Retour à la veille
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0"><FileText size={20} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-white leading-snug">{title}</h1>
          <p className="text-xs text-neutral-500 mt-1">{watch.name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {generated && <span className="text-[11px] text-neutral-500">{generated}</span>}
            <Badge cls={
              report.type === 'synthesis' || report.type === 'analyse' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
              report.type === 'market' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
              report.type === 'prediction' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
              'bg-violet-500/10 text-violet-400 border-violet-500/20'
            }>Agent {report.agent_used ?? 2}</Badge>
            {c.is_challenger_enriched && <Badge cls="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"><Shield size={10} className="inline mr-0.5" /> Audité</Badge>}
          </div>
        </div>
      </div>

      {/* Executive summary */}
      {summary && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-2">Synthèse exécutive</h2>
          <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">{summary}</p>
        </section>
      )}

      {/* Company analyses */}
      {c.company_analyses && c.company_analyses.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Building2 size={16} className="text-blue-400" /> Analyse par entreprise</h2>
          <div className="space-y-4">
            {c.company_analyses.map((ca: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl bg-neutral-800/50 border border-neutral-700">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-white">{ca.company}</h3>
                  <Badge cls={ca.momentum === 'positive' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : ca.momentum === 'negative' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-neutral-800 text-neutral-400 border-neutral-700'}>{ca.momentum === 'positive' ? 'Dynamique +' : ca.momentum === 'negative' ? 'Dynamique -' : 'Stable'}</Badge>
                </div>
                {ca.position_summary && <p className="text-xs text-neutral-400 leading-relaxed mb-3">{ca.position_summary}</p>}
                {ca.key_moves?.length > 0 && <div className="mb-2"><div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Mouvements clés</div><ul className="space-y-1">{ca.key_moves.map((m: string, i: number) => <li key={i} className="flex items-start gap-1.5 text-xs text-neutral-300"><Zap size={10} className="text-amber-400 mt-0.5 flex-shrink-0" />{m}</li>)}</ul></div>}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {ca.strengths?.length > 0 && <div><div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide mb-1">Forces</div><ul className="space-y-0.5">{ca.strengths.map((s: string, i: number) => <li key={i} className="text-xs text-neutral-300 flex items-start gap-1"><span className="text-emerald-400">+</span> {s}</li>)}</ul></div>}
                  {ca.weaknesses_or_risks?.length > 0 && <div><div className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">Risques</div><ul className="space-y-0.5">{ca.weaknesses_or_risks.map((w: string, i: number) => <li key={i} className="text-xs text-neutral-300 flex items-start gap-1"><span className="text-red-400">-</span> {w}</li>)}</ul></div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Competitive comparison */}
      {c.competitive_comparison && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><Swords size={16} className="text-violet-400" /> Analyse comparative</h2>
          {c.competitive_comparison.overview && <p className="text-sm text-neutral-300 leading-relaxed mb-4">{c.competitive_comparison.overview}</p>}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {c.competitive_comparison.leader && <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><div className="text-[10px] font-bold text-emerald-400 uppercase mb-1">Leader</div><p className="text-xs text-emerald-300">{c.competitive_comparison.leader}</p></div>}
            {c.competitive_comparison.challenger && <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"><div className="text-[10px] font-bold text-amber-400 uppercase mb-1">Challenger</div><p className="text-xs text-amber-300">{c.competitive_comparison.challenger}</p></div>}
          </div>
        </section>
      )}

      {/* Market dynamics */}
      {c.market_dynamics && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-400" /> Dynamiques de marché</h2>
          <div className="space-y-3">
            {c.market_dynamics.trends?.length > 0 && <div><div className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Tendances</div><ul className="list-disc list-inside text-xs text-neutral-300 space-y-1">{c.market_dynamics.trends.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></div>}
            {c.market_dynamics.emerging_opportunities?.length > 0 && <div><div className="text-[10px] font-semibold text-emerald-400 uppercase mb-1">Opportunités</div><ul className="list-disc list-inside text-xs text-neutral-300 space-y-1">{c.market_dynamics.emerging_opportunities.map((o: string, i: number) => <li key={i}>{o}</li>)}</ul></div>}
            {c.market_dynamics.threats?.length > 0 && <div><div className="text-[10px] font-semibold text-red-400 uppercase mb-1">Menaces</div><ul className="list-disc list-inside text-xs text-neutral-300 space-y-1">{c.market_dynamics.threats.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></div>}
          </div>
        </section>
      )}

      {/* Strategic alerts */}
      {c.strategic_alerts?.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-red-400" /> Alertes stratégiques</h2>
          <div className="space-y-2">
            {c.strategic_alerts.map((a: any, i: number) => (
              <div key={i} className={`p-3 rounded-lg border ${a.severity === 'high' ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge cls={a.severity === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}>{a.severity === 'high' ? 'Critique' : 'Important'}</Badge>
                  {a.company && <span className="text-xs font-semibold text-neutral-300">{a.company}</span>}
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">{a.alert}</p>
                {a.recommended_action && <div className="mt-2 flex items-start gap-1.5"><ArrowUpRight size={10} className="text-blue-400 mt-0.5" /><p className="text-xs text-blue-400">{a.recommended_action}</p></div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {c.recommendations?.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2"><ListChecks size={16} className="text-blue-400" /> Recommandations</h2>
          <div className="space-y-2">
            {c.recommendations.map((r: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
                <div className="flex items-center gap-2 mb-1">
                  <Badge cls={r.priority === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' : r.priority === 'low' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}>{r.priority ?? 'medium'}</Badge>
                  {r.time_horizon && <span className="text-[10px] text-neutral-500 flex items-center gap-0.5"><Clock size={9} /> {r.time_horizon}</span>}
                </div>
                <p className="text-xs text-neutral-200 font-medium">{typeof r === 'string' ? r : r.action}</p>
                {typeof r !== 'string' && r.rationale && <p className="text-[11px] text-neutral-500 mt-1">{r.rationale}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Player mapping */}
      {c.player_mapping?.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Layers size={16} className="text-violet-400" /> Cartographie des acteurs</h2>
          <div className="space-y-2">
            {c.player_mapping.map((p: any, i: number) => {
              const catColors: Record<string, string> = { leader: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', challenger: 'bg-amber-500/10 text-amber-400 border-amber-500/20', follower: 'bg-neutral-800 text-neutral-400 border-neutral-700', niche: 'bg-violet-500/10 text-violet-400 border-violet-500/20' }
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-800/50 border border-neutral-700">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1"><span className="text-sm font-bold text-white">{p.company}</span><Badge cls={catColors[p.category ?? 'follower'] ?? catColors.follower}>{p.category}</Badge></div>
                    {p.competitive_position && <p className="text-xs text-neutral-400">{p.competitive_position}</p>}
                  </div>
                  {p.estimated_market_share && <div className="text-right flex-shrink-0"><div className="text-lg font-bold text-white">{p.estimated_market_share}</div><div className="text-[9px] text-neutral-500">Part estimée</div></div>}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Predictions by company */}
      {c.predictions_by_company?.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Crosshair size={16} className="text-indigo-400" /> Prédictions par entreprise</h2>
          <div className="space-y-5">
            {c.predictions_by_company.map((pred: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl bg-neutral-800/50 border border-neutral-700">
                <h3 className="text-sm font-bold text-white mb-3">{pred.company}</h3>
                {pred.next_moves?.length > 0 && (
                  <div className="space-y-2">
                    {pred.next_moves.map((m: any, i: number) => (
                      <div key={i} className="p-2.5 bg-neutral-900/50 rounded-lg border border-neutral-800">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-medium text-neutral-200">{m.move}</span>
                          {m.probability && <Badge cls="bg-red-500/10 text-red-400 border-red-500/20">{m.probability}</Badge>}
                        </div>
                        {m.timing && <div className="text-[10px] text-neutral-500 mb-1">Timing : {m.timing}</div>}
                        {m.impact_on_market && <div className="text-[11px] text-neutral-400">{m.impact_on_market}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Legacy insights */}
      {hasLegacy && c.key_insights && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-3">Insights clés</h2>
          <ul className="space-y-3">
            {c.key_insights.map((ins: any, idx: number) => (
              <li key={idx} className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 text-sm text-neutral-300">
                {ins.company && <div className="text-xs font-semibold text-blue-400 mb-1">{ins.company}</div>}
                <p className="leading-relaxed">{ins.insight}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sources */}
      {c.sources_index?.length > 0 && (
        <section className={card}>
          <h2 className="text-sm font-bold text-white mb-2">Sources</h2>
          <ol className="space-y-2 text-sm">
            {c.sources_index.map((s: any) => (
              <li key={s.i} className="flex gap-2">
                <span className="text-neutral-600 w-6 flex-shrink-0">[{s.i}]</span>
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">{s.title ?? s.url}</a> : <span className="text-neutral-300">{s.title}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
