import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Building2, Swords, TrendingUp,
  AlertTriangle, ListChecks, Link2, ArrowUpRight, ArrowDownRight,
  Minus, Shield, Target, Clock, Zap,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type SourceRef = { i?: number; url?: string; title?: string }

type CompanyAnalysis = {
  company?: string
  position_summary?: string
  key_moves?: string[]
  strengths?: string[]
  weaknesses_or_risks?: string[]
  momentum?: 'positive' | 'neutral' | 'negative'
  sources?: SourceRef[]
  source_refs?: number[]
}

type CompetitiveComparison = {
  overview?: string
  leader?: string
  challenger?: string
  differentiators?: Array<{
    company?: string
    advantage?: string
    implication?: string
  }>
  gaps_to_watch?: string[]
}

type MarketDynamics = {
  trends?: string[]
  emerging_opportunities?: string[]
  threats?: string[]
}

type StrategicAlert = {
  severity?: 'high' | 'medium'
  alert?: string
  company?: string
  recommended_action?: string
}

type Recommendation = {
  priority?: 'high' | 'medium' | 'low'
  action?: string
  rationale?: string
  time_horizon?: string
}

type ReportContent = {
  title?: string
  executive_summary?: string
  company_analyses?: CompanyAnalysis[]
  competitive_comparison?: CompetitiveComparison
  market_dynamics?: MarketDynamics
  strategic_alerts?: StrategicAlert[]
  recommendations?: Recommendation[]
  // Legacy fields (anciens rapports)
  key_insights?: Array<{
    company?: string
    insight?: string
    importance?: string
    type?: string
    sources?: SourceRef[]
  }>
  trends?: string[]
  alerts?: string[]
  period?: string
  signals_analyzed?: number
  sources_index?: Array<{ i: number; url?: string; title?: string }>
  generated_at?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function cleanSummary(raw: string): string {
  return raw
    .replace(/```(?:json)?\s*\n?/g, '')
    .replace(/```\n?/g, '')
    .replace(/^\s*\{[\s\S]*?\}\s*$/g, '')
    .trim()
}

const MomentumIcon = ({ m }: { m?: string }) => {
  if (m === 'positive') return <ArrowUpRight size={14} className="text-emerald-600" />
  if (m === 'negative') return <ArrowDownRight size={14} className="text-red-500" />
  return <Minus size={14} className="text-neutral-400" />
}

const MomentumLabel = ({ m }: { m?: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    positive: { label: 'Dynamique positive', cls: 'text-emerald-700 bg-emerald-50' },
    negative: { label: 'Dynamique négative', cls: 'text-red-700 bg-red-50' },
    neutral:  { label: 'Stable', cls: 'text-neutral-600 bg-neutral-100' },
  }
  const v = map[m ?? 'neutral'] ?? map.neutral
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${v.cls}`}>{v.label}</span>
}

const PriorityBadge = ({ p }: { p?: string }) => {
  const map: Record<string, string> = {
    high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-blue-100 text-blue-800',
  }
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${map[p ?? 'medium'] ?? map.medium}`}>{p ?? 'medium'}</span>
}

const SeverityBadge = ({ s }: { s?: string }) => {
  const isHigh = s === 'high'
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isHigh ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
      {isHigh ? 'Critique' : 'Important'}
    </span>
  )
}

function SourceLinks({ sources }: { sources?: SourceRef[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {sources.map((s, j) =>
        s?.url ? (
          <a key={j} href={s.url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5">
            <Link2 size={9} />[{s.i ?? j + 1}]
          </a>
        ) : null,
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function WatchReportPage({
  params,
}: {
  params: { id: string; reportId: string }
}) {
  const supabase = createClient()

  const { data: watch } = await supabase
    .from('watches').select('id, name').eq('id', params.id).single()
  if (!watch) notFound()

  const { data: report, error } = await supabase
    .from('reports').select('*').eq('id', params.reportId).eq('watch_id', params.id).maybeSingle()
  if (error || !report) notFound()

  const c = (report.content ?? {}) as ReportContent
  const rawSummary = report.summary ?? c.executive_summary ?? ''
  const summary = typeof rawSummary === 'string' && rawSummary.includes('```')
    ? cleanSummary(rawSummary)
    : rawSummary
  const title = report.title ?? c.title ?? 'Rapport de veille'
  const generated = fmtDate(report.generated_at) ?? fmtDate(c.generated_at) ?? null

  const hasNewFormat = !!c.company_analyses?.length || !!c.competitive_comparison
  const hasLegacy = !hasNewFormat && !!c.key_insights?.length

  return (
    <div className="max-w-3xl mx-auto pb-20 lg:pb-0">

      {/* Header */}
      <Link href={`/veilles/${params.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 mb-4 transition-colors">
        <ArrowLeft size={12} /> Retour à la veille
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
          <FileText size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-neutral-900 leading-snug">{title}</h1>
          <p className="text-xs text-neutral-500 mt-1">{watch.name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {generated && <span className="text-[11px] text-neutral-400">{generated}</span>}
            <span className={`badge text-[10px] ${
              report.type === 'synthesis' || report.type === 'analyse' ? 'badge-blue'
                : report.type === 'market' ? 'badge-green' : 'badge-purple'
            }`}>Agent {report.agent_used ?? 2}</span>
            {c.period && <span className="text-[11px] text-neutral-500">{c.period}</span>}
          </div>
        </div>
      </div>

      {/* Synthèse exécutive */}
      {summary && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-2">Synthèse exécutive</h2>
          <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
        </section>
      )}

      {/* ══════════ NOUVEAU FORMAT ══════════ */}

      {/* Analyse par entreprise */}
      {c.company_analyses && c.company_analyses.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <Building2 size={16} className="text-blue-700" />
            Analyse par entreprise
          </h2>
          <div className="space-y-4">
            {c.company_analyses.map((ca, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-neutral-900">{ca.company}</h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <MomentumIcon m={ca.momentum} />
                    <MomentumLabel m={ca.momentum} />
                  </div>
                </div>

                {ca.position_summary && (
                  <p className="text-xs text-neutral-600 leading-relaxed mb-3">{ca.position_summary}</p>
                )}

                {ca.key_moves && ca.key_moves.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Mouvements clés</div>
                    <ul className="space-y-1">
                      {ca.key_moves.map((m, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-neutral-800">
                          <Zap size={10} className="text-amber-500 mt-0.5 flex-shrink-0" />
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 mt-3">
                  {ca.strengths && ca.strengths.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Forces</div>
                      <ul className="space-y-0.5">
                        {ca.strengths.map((s, i) => (
                          <li key={i} className="text-xs text-neutral-700 flex items-start gap-1">
                            <span className="text-emerald-500 mt-0.5">+</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {ca.weaknesses_or_risks && ca.weaknesses_or_risks.length > 0 && (
                    <div>
                      <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">Risques / Faiblesses</div>
                      <ul className="space-y-0.5">
                        {ca.weaknesses_or_risks.map((w, i) => (
                          <li key={i} className="text-xs text-neutral-700 flex items-start gap-1">
                            <span className="text-red-400 mt-0.5">-</span> {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <SourceLinks sources={ca.sources} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comparaison concurrentielle */}
      {c.competitive_comparison && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Swords size={16} className="text-purple-600" />
            Analyse comparative
          </h2>

          {c.competitive_comparison.overview && (
            <p className="text-sm text-neutral-700 leading-relaxed mb-4">{c.competitive_comparison.overview}</p>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            {c.competitive_comparison.leader && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wide mb-1">Leader</div>
                <p className="text-xs text-emerald-900">{c.competitive_comparison.leader}</p>
              </div>
            )}
            {c.competitive_comparison.challenger && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wide mb-1">Challenger</div>
                <p className="text-xs text-amber-900">{c.competitive_comparison.challenger}</p>
              </div>
            )}
          </div>

          {c.competitive_comparison.differentiators && c.competitive_comparison.differentiators.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">Avantages différenciants</div>
              <div className="space-y-2">
                {c.competitive_comparison.differentiators.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white border border-neutral-100">
                    <Shield size={12} className="text-purple-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-purple-800">{d.company}</span>
                      <p className="text-xs text-neutral-700">{d.advantage}</p>
                      {d.implication && <p className="text-[11px] text-neutral-500 mt-0.5 italic">{d.implication}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.competitive_comparison.gaps_to_watch && c.competitive_comparison.gaps_to_watch.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-2">Écarts à surveiller</div>
              <ul className="space-y-1">
                {c.competitive_comparison.gaps_to_watch.map((g, i) => (
                  <li key={i} className="text-xs text-neutral-800 flex items-start gap-1.5">
                    <Target size={10} className="text-red-400 mt-0.5 flex-shrink-0" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Dynamiques de marché */}
      {c.market_dynamics && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            Dynamiques de marché
          </h2>
          <div className="space-y-3">
            {c.market_dynamics.trends && c.market_dynamics.trends.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Tendances</div>
                <ul className="list-disc list-inside text-xs text-neutral-700 space-y-1">
                  {c.market_dynamics.trends.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
            {c.market_dynamics.emerging_opportunities && c.market_dynamics.emerging_opportunities.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Opportunités émergentes</div>
                <ul className="list-disc list-inside text-xs text-neutral-700 space-y-1">
                  {c.market_dynamics.emerging_opportunities.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </div>
            )}
            {c.market_dynamics.threats && c.market_dynamics.threats.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1">Menaces</div>
                <ul className="list-disc list-inside text-xs text-neutral-700 space-y-1">
                  {c.market_dynamics.threats.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Alertes stratégiques */}
      {c.strategic_alerts && c.strategic_alerts.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600" />
            Alertes stratégiques
          </h2>
          <div className="space-y-2">
            {c.strategic_alerts.map((a, i) => (
              <div key={i} className={`p-3 rounded-lg border ${a.severity === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <SeverityBadge s={a.severity} />
                  {a.company && <span className="text-xs font-semibold text-neutral-700">{a.company}</span>}
                </div>
                <p className="text-xs text-neutral-800 leading-relaxed">{a.alert}</p>
                {a.recommended_action && (
                  <div className="mt-2 flex items-start gap-1.5">
                    <ArrowUpRight size={10} className="text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-blue-800">{a.recommended_action}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommandations */}
      {c.recommendations && c.recommendations.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <ListChecks size={16} className="text-blue-600" />
            Recommandations
          </h2>
          <div className="space-y-2">
            {c.recommendations.map((r, i) => (
              <div key={i} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100">
                <div className="flex items-center gap-2 mb-1">
                  <PriorityBadge p={typeof r === 'string' ? undefined : r.priority} />
                  {typeof r !== 'string' && r.time_horizon && (
                    <span className="text-[10px] text-neutral-400 flex items-center gap-0.5">
                      <Clock size={9} /> {r.time_horizon}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-900 font-medium">{typeof r === 'string' ? r : r.action}</p>
                {typeof r !== 'string' && r.rationale && (
                  <p className="text-[11px] text-neutral-500 mt-1">{r.rationale}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════ LEGACY FORMAT (anciens rapports) ══════════ */}

      {hasLegacy && c.key_insights && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3">Insights clés</h2>
          <ul className="space-y-3">
            {c.key_insights.map((ins, idx) => (
              <li key={idx} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100 text-sm text-neutral-800">
                {ins.company && <div className="text-xs font-semibold text-blue-800 mb-1">{ins.company}</div>}
                <p className="leading-relaxed">{ins.insight}</p>
                <SourceLinks sources={ins.sources} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasLegacy && c.trends && c.trends.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-2 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" /> Tendances
          </h2>
          <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
            {c.trends.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </section>
      )}

      {hasLegacy && c.alerts && c.alerts.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-2 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" /> Alertes
          </h2>
          <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
            {c.alerts.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      {/* Sources */}
      {c.sources_index && c.sources_index.length > 0 && (
        <section className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-2">Sources</h2>
          <ol className="space-y-2 text-sm">
            {c.sources_index.map((s) => (
              <li key={s.i} className="flex gap-2">
                <span className="text-neutral-400 w-6 flex-shrink-0">[{s.i}]</span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all">{s.title ?? s.url}</a>
                ) : (
                  <span>{s.title}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {typeof c.signals_analyzed === 'number' && (
        <p className="text-[11px] text-neutral-400 mt-4">
          {c.signals_analyzed} signal{c.signals_analyzed > 1 ? 'ux' : ''} analysé
          {c.signals_analyzed > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
