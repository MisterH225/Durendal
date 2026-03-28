import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FileText, Building2, Swords, TrendingUp,
  AlertTriangle, ListChecks, Link2, ArrowUpRight, ArrowDownRight,
  Minus, Shield, Target, Clock, Zap, Map, BarChart3, Route,
  Handshake, CircleAlert, Layers, Crosshair, ChevronRight,
} from 'lucide-react'
import ReportChat from './ReportChat'
import ExportPdfButton from './ExportPdfButton'

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

// ── Agent 3 types ─────────────────────────────────────────────────────────────

type PlayerMapping = {
  company?: string
  category?: 'leader' | 'challenger' | 'follower' | 'niche'
  estimated_market_share?: string
  competitive_position?: string
  recent_momentum?: string
}

type StructuralTrend = {
  trend?: string
  type?: string
  impact_level?: string
  time_horizon?: string
  affected_players?: string[]
}

type EntryBarrier = {
  type?: string
  description?: string
  severity?: string
}

type AttractivenessEntry = {
  company?: string
  attractiveness_score?: number
  competitiveness_score?: number
  justification?: string
}

type Scenario = {
  probability?: string
  description?: string
  key_drivers?: string[]
}

// ── Agent 4 types ─────────────────────────────────────────────────────────────

type SwotPoint = { point?: string; source_ref?: number }
type SwotAnalysis = {
  entity?: string
  strengths?: SwotPoint[]
  weaknesses?: SwotPoint[]
  opportunities?: SwotPoint[]
  threats?: SwotPoint[]
}

type StrategicRecommendation = {
  rank?: number
  action?: string
  rationale?: string
  priority?: string
  category?: string
  time_horizon?: string
  estimated_investment?: string
  expected_impact?: string
  risks?: string[]
  kpis?: string[]
}

type RoadmapPhase = {
  phase?: string
  actions?: Array<{ action?: string; deadline?: string; owner_type?: string }>
  milestone?: string
}

type RiskEntry = {
  risk?: string
  probability?: string
  impact?: string
  mitigation?: string
  risk_score?: number
}

type PartnershipReco = {
  partner_type?: string
  rationale?: string
  model?: string
  potential_partners?: string[]
  priority?: string
}

// ── Agent 5 types ─────────────────────────────────────────────────────────────

type NextMove = {
  move?: string
  probability?: string
  timing?: string
  confidence?: string
  supporting_signals?: string[]
  impact_on_market?: string
}

type CounterPositioning = {
  scenario?: string
  recommended_action?: string
  type?: string
  priority?: string
  urgency?: string
  expected_outcome?: string
}

type PredictionByCompany = {
  company?: string
  next_moves?: NextMove[]
  strategic_intention?: {
    primary_objective?: string
    strategy_type?: string
    alliances_anticipated?: string[]
    conflicts_emerging?: string[]
    evidence?: string[]
  }
  counter_positioning?: CounterPositioning[]
}

type CompanyEvolution = {
  company?: string
  previous_momentum?: string
  current_momentum?: string
  trajectory?: 'improving' | 'stable' | 'declining'
  key_changes?: string[]
  new_developments?: string[]
}

type EvolutionSinceLastReport = {
  period_comparison?: string
  company_evolutions?: CompanyEvolution[]
  market_shifts?: string[]
  leader_change?: string
  emerging_risks_since_last?: string[]
  resolved_issues?: string[]
}

type ReportContent = {
  title?: string
  executive_summary?: string
  company_analyses?: CompanyAnalysis[]
  competitive_comparison?: CompetitiveComparison
  market_dynamics?: MarketDynamics
  strategic_alerts?: StrategicAlert[]
  recommendations?: Recommendation[]
  evolution_since_last_report?: EvolutionSinceLastReport
  previous_report_id?: string
  report_sequence?: number

  // Agent 3 fields
  market_overview?: {
    market_size_estimate?: string
    growth_assessment?: string
    maturity_stage?: string
    key_figures?: string[]
  }
  player_mapping?: PlayerMapping[]
  structural_trends?: StructuralTrend[]
  entry_barriers?: { barriers?: EntryBarrier[]; key_success_factors?: string[] }
  attractiveness_matrix?: AttractivenessEntry[]
  scenarios?: { optimistic?: Scenario; realistic?: Scenario; pessimistic?: Scenario }

  // Agent 4 fields
  key_strategic_issues?: string[]
  swot_analyses?: SwotAnalysis[]
  strategic_recommendations?: StrategicRecommendation[]
  roadmap?: { phases?: RoadmapPhase[]; dependencies?: string[] }
  risk_analysis?: RiskEntry[]
  partnership_recommendations?: PartnershipReco[]

  // Agent 5 fields
  predictions_by_company?: PredictionByCompany[]
  market_predictions?: {
    consolidation_probability?: string
    disruption_risks?: string[]
    emerging_opportunities?: string[]
    key_inflection_points?: Array<{
      event?: string
      timing?: string
      probability?: string
      implications?: string
    }>
  }
  confidence_matrix?: {
    overall_confidence?: string
    data_quality?: string
    prediction_horizon?: string
    key_assumptions?: string[]
    blind_spots?: string[]
  }
  mirofish_used?: boolean

  // Legacy fields
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
    <div className="flex min-h-[calc(100vh-64px)]">
    {/* Rapport */}
    <div id="report-content" className="flex-1 min-w-0 max-w-3xl mx-auto pb-20 lg:pb-0 px-4">

      {/* Header */}
      <div className="flex items-center justify-between mb-4" data-no-pdf>
        <Link href={`/veilles/${params.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
          <ArrowLeft size={12} /> Retour à la veille
        </Link>
        <ExportPdfButton reportTitle={title} />
      </div>

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
                : report.type === 'market' ? 'badge-green'
                : report.type === 'prediction' ? 'badge-indigo'
                : 'badge-purple'
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

      {/* Évolution depuis le dernier rapport */}
      {c.evolution_since_last_report && (c.evolution_since_last_report.company_evolutions?.length ?? 0) > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-600" />
            Évolution depuis le dernier rapport
          </h2>
          {c.evolution_since_last_report.period_comparison && (
            <p className="text-[11px] text-neutral-500 mb-3">{c.evolution_since_last_report.period_comparison}</p>
          )}

          <div className="space-y-3 mb-4">
            {c.evolution_since_last_report.company_evolutions!.map((evo, i) => {
              const trajectoryConfig = {
                improving: { label: 'En progression', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: ArrowUpRight },
                stable:    { label: 'Stable',         color: 'text-neutral-600', bg: 'bg-neutral-50', border: 'border-neutral-200', icon: Minus },
                declining: { label: 'En déclin',      color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: ArrowDownRight },
              }
              const cfg = trajectoryConfig[evo.trajectory ?? 'stable']
              const TIcon = cfg.icon
              return (
                <div key={i} className={`p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-neutral-900">{evo.company}</span>
                    <div className="flex items-center gap-1.5">
                      {evo.previous_momentum && evo.current_momentum && evo.previous_momentum !== evo.current_momentum && (
                        <span className="text-[9px] text-neutral-400">{evo.previous_momentum} →</span>
                      )}
                      <span className={`text-[10px] font-semibold ${cfg.color} flex items-center gap-0.5`}>
                        <TIcon size={12} />
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                  {evo.key_changes && evo.key_changes.length > 0 && (
                    <div className="mb-1.5">
                      <div className="text-[9px] font-semibold text-neutral-500 uppercase mb-0.5">Changements clés</div>
                      <ul className="text-[11px] text-neutral-700 space-y-0.5">
                        {evo.key_changes.map((ch, j) => <li key={j}>• {ch}</li>)}
                      </ul>
                    </div>
                  )}
                  {evo.new_developments && evo.new_developments.length > 0 && (
                    <div>
                      <div className="text-[9px] font-semibold text-blue-600 uppercase mb-0.5">Nouveaux développements</div>
                      <ul className="text-[11px] text-neutral-700 space-y-0.5">
                        {evo.new_developments.map((nd, j) => <li key={j}>• {nd}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {c.evolution_since_last_report.leader_change && (
            <div className="text-xs text-neutral-700 mb-2">
              <span className="font-semibold text-indigo-700">Leadership :</span> {c.evolution_since_last_report.leader_change}
            </div>
          )}
          {c.evolution_since_last_report.market_shifts && c.evolution_since_last_report.market_shifts.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-neutral-500 uppercase mb-1">Changements de marché</div>
              <ul className="list-disc list-inside text-xs text-neutral-700 space-y-0.5">
                {c.evolution_since_last_report.market_shifts.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {c.evolution_since_last_report.resolved_issues && c.evolution_since_last_report.resolved_issues.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-green-700 uppercase mb-1">Problèmes résolus</div>
              <ul className="list-disc list-inside text-xs text-neutral-700 space-y-0.5">
                {c.evolution_since_last_report.resolved_issues.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
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

      {/* ══════════ AGENT 3 — ANALYSE DE MARCHÉ ══════════ */}

      {/* Vue d'ensemble marché */}
      {c.market_overview && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Map size={16} className="text-blue-600" />
            Vue d&apos;ensemble du marché
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {c.market_overview.maturity_stage && (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                <div className="text-[10px] font-bold text-blue-700 uppercase mb-1">Maturité</div>
                <div className="text-xs font-semibold text-blue-900 capitalize">{c.market_overview.maturity_stage}</div>
              </div>
            )}
            {c.market_overview.growth_assessment && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 col-span-2 sm:col-span-3">
                <div className="text-[10px] font-bold text-emerald-700 uppercase mb-1">Croissance</div>
                <div className="text-xs text-emerald-900">{c.market_overview.growth_assessment}</div>
              </div>
            )}
          </div>
          {c.market_overview.market_size_estimate && (
            <p className="text-xs text-neutral-700 mb-2"><span className="font-semibold">Taille estimée :</span> {c.market_overview.market_size_estimate}</p>
          )}
          {c.market_overview.key_figures && c.market_overview.key_figures.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {c.market_overview.key_figures.map((fig, i) => (
                <span key={i} className="badge badge-blue text-[10px]">{fig}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Cartographie des acteurs */}
      {c.player_mapping && c.player_mapping.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <Layers size={16} className="text-purple-600" />
            Cartographie des acteurs
          </h2>
          <div className="space-y-2">
            {c.player_mapping.map((p, i) => {
              const catColors: Record<string, string> = {
                leader: 'bg-emerald-100 text-emerald-800', challenger: 'bg-amber-100 text-amber-800',
                follower: 'bg-neutral-100 text-neutral-700', niche: 'bg-purple-100 text-purple-800',
              }
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-neutral-900">{p.company}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${catColors[p.category ?? 'follower']}`}>
                        {p.category}
                      </span>
                      <MomentumIcon m={p.recent_momentum} />
                    </div>
                    {p.competitive_position && <p className="text-xs text-neutral-600">{p.competitive_position}</p>}
                  </div>
                  {p.estimated_market_share && (
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-neutral-900">{p.estimated_market_share}</div>
                      <div className="text-[9px] text-neutral-400">Part estimée</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Tendances structurelles */}
      {c.structural_trends && c.structural_trends.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            Tendances structurelles
          </h2>
          <div className="space-y-2">
            {c.structural_trends.map((t, i) => (
              <div key={i} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                    t.impact_level === 'high' ? 'bg-red-100 text-red-800' :
                    t.impact_level === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                  }`}>{t.impact_level ?? 'medium'}</span>
                  <span className="badge badge-gray text-[9px]">{t.type ?? 'structural'}</span>
                </div>
                <p className="text-xs text-neutral-800 font-medium">{t.trend}</p>
                {t.time_horizon && <p className="text-[11px] text-neutral-500 mt-1">{t.time_horizon}</p>}
                {t.affected_players && t.affected_players.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.affected_players.map((p, j) => (
                      <span key={j} className="badge badge-blue text-[9px]">{p}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Barrières à l'entrée */}
      {c.entry_barriers && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Shield size={16} className="text-red-600" />
            Barrières à l&apos;entrée &amp; facteurs clés de succès
          </h2>
          {c.entry_barriers.barriers && c.entry_barriers.barriers.length > 0 && (
            <div className="mb-4">
              <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-2">Barrières</div>
              <div className="space-y-1.5">
                {c.entry_barriers.barriers.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-neutral-800">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 mt-0.5 ${
                      b.severity === 'high' ? 'bg-red-100 text-red-700' :
                      b.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>{b.type}</span>
                    {b.description}
                  </div>
                ))}
              </div>
            </div>
          )}
          {c.entry_barriers.key_success_factors && c.entry_barriers.key_success_factors.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-2">Facteurs clés de succès</div>
              <ul className="space-y-1">
                {c.entry_barriers.key_success_factors.map((f, i) => (
                  <li key={i} className="text-xs text-neutral-800 flex items-start gap-1.5">
                    <Crosshair size={10} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Matrice attractivité / compétitivité */}
      {c.attractiveness_matrix && c.attractiveness_matrix.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <BarChart3 size={16} className="text-amber-600" />
            Matrice attractivité / compétitivité
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  {['Entreprise', 'Attractivité', 'Compétitivité', 'Justification'].map(h => (
                    <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.attractiveness_matrix.map((a, i) => (
                  <tr key={i} className="border-b border-neutral-50">
                    <td className="py-2.5 px-3 font-semibold text-neutral-900">{a.company}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 bg-neutral-100 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(a.attractiveness_score ?? 5) * 10}%` }} />
                        </div>
                        <span className="font-bold text-neutral-700">{a.attractiveness_score}/10</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 bg-neutral-100 rounded-full h-2">
                          <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(a.competitiveness_score ?? 5) * 10}%` }} />
                        </div>
                        <span className="font-bold text-neutral-700">{a.competitiveness_score}/10</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 max-w-[200px]">{a.justification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Scénarios prospectifs */}
      {c.scenarios && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Route size={16} className="text-purple-600" />
            Scénarios prospectifs (12-18 mois)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              { key: 'optimistic' as const, label: 'Optimiste', color: 'emerald', icon: '↗' },
              { key: 'realistic' as const, label: 'Réaliste', color: 'blue', icon: '→' },
              { key: 'pessimistic' as const, label: 'Pessimiste', color: 'red', icon: '↘' },
            ]).map(({ key, label, color, icon }) => {
              const s = c.scenarios?.[key]
              if (!s) return null
              return (
                <div key={key} className={`p-4 rounded-xl bg-${color}-50 border border-${color}-200`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold text-${color}-800`}>{icon} {label}</span>
                    {s.probability && <span className={`text-[10px] font-bold text-${color}-700 bg-${color}-100 px-2 py-0.5 rounded-full`}>{s.probability}</span>}
                  </div>
                  <p className="text-xs text-neutral-700 leading-relaxed mb-2">{s.description}</p>
                  {s.key_drivers && s.key_drivers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.key_drivers.map((d, i) => (
                        <span key={i} className="text-[9px] bg-white/60 text-neutral-600 px-1.5 py-0.5 rounded">{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ══════════ AGENT 4 — PLAN STRATÉGIQUE ══════════ */}

      {/* Enjeux stratégiques */}
      {c.key_strategic_issues && c.key_strategic_issues.length > 0 && (
        <section className="card-lg mb-4 border-l-4 border-purple-400">
          <h2 className="text-sm font-bold text-neutral-900 mb-3">Enjeux stratégiques majeurs</h2>
          <div className="space-y-2">
            {c.key_strategic_issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-neutral-800">
                <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold flex-shrink-0 text-[10px]">{i + 1}</span>
                {issue}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Analyses SWOT */}
      {c.swot_analyses && c.swot_analyses.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <Crosshair size={16} className="text-indigo-600" />
            Analyses SWOT
          </h2>
          <div className="space-y-4">
            {c.swot_analyses.map((sw, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 overflow-hidden">
                <div className="bg-neutral-50 px-4 py-2.5 border-b border-neutral-200">
                  <h3 className="text-sm font-bold text-neutral-900">{sw.entity}</h3>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-neutral-100">
                  {([
                    { key: 'strengths' as const, label: 'Forces', color: 'emerald' },
                    { key: 'weaknesses' as const, label: 'Faiblesses', color: 'red' },
                    { key: 'opportunities' as const, label: 'Opportunités', color: 'blue' },
                    { key: 'threats' as const, label: 'Menaces', color: 'amber' },
                  ]).map(({ key, label, color }) => (
                    <div key={key} className="p-3">
                      <div className={`text-[10px] font-bold text-${color}-700 uppercase tracking-wide mb-1.5`}>{label}</div>
                      <ul className="space-y-1">
                        {(sw[key] ?? []).map((item, j) => (
                          <li key={j} className="text-[11px] text-neutral-700">
                            {typeof item === 'string' ? item : item.point}
                            {typeof item !== 'string' && item.source_ref ? <span className="text-neutral-400 ml-1">[{item.source_ref}]</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommandations stratégiques détaillées (Agent 4) */}
      {c.strategic_recommendations && c.strategic_recommendations.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <ListChecks size={16} className="text-blue-600" />
            Plan d&apos;action stratégique
          </h2>
          <div className="space-y-3">
            {c.strategic_recommendations.map((r, i) => {
              const prioColors: Record<string, string> = {
                critical: 'bg-red-100 text-red-800 border-red-200',
                high: 'bg-amber-100 text-amber-800 border-amber-200',
                medium: 'bg-blue-100 text-blue-800 border-blue-200',
              }
              return (
                <div key={i} className={`p-4 rounded-xl border ${prioColors[r.priority ?? 'medium'] ?? prioColors.medium}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center font-bold text-xs">{r.rank ?? i + 1}</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                      r.priority === 'critical' ? 'bg-red-200 text-red-900' :
                      r.priority === 'high' ? 'bg-amber-200 text-amber-900' : 'bg-blue-200 text-blue-900'
                    }`}>{r.priority}</span>
                    {r.time_horizon && (
                      <span className="text-[10px] text-neutral-500 flex items-center gap-0.5">
                        <Clock size={9} /> {r.time_horizon}
                      </span>
                    )}
                    {r.category && <span className="badge badge-gray text-[9px]">{r.category}</span>}
                  </div>
                  <p className="text-xs text-neutral-900 font-semibold mb-1">{r.action}</p>
                  {r.rationale && <p className="text-[11px] text-neutral-600 mb-2">{r.rationale}</p>}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    {r.estimated_investment && (
                      <div><span className="font-semibold text-neutral-500">Budget :</span> {r.estimated_investment}</div>
                    )}
                    {r.expected_impact && (
                      <div><span className="font-semibold text-neutral-500">Impact :</span> {r.expected_impact}</div>
                    )}
                  </div>
                  {r.kpis && r.kpis.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {r.kpis.map((k, j) => (
                        <span key={j} className="text-[9px] bg-white/60 text-neutral-600 px-1.5 py-0.5 rounded border border-neutral-200">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Feuille de route */}
      {c.roadmap?.phases && c.roadmap.phases.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <Route size={16} className="text-teal-600" />
            Feuille de route
          </h2>
          <div className="space-y-4">
            {c.roadmap.phases.map((phase, i) => (
              <div key={i} className="relative pl-6 border-l-2 border-teal-300">
                <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-teal-500 border-2 border-white" />
                <h3 className="text-xs font-bold text-teal-800 mb-2">{phase.phase}</h3>
                {phase.actions && phase.actions.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {phase.actions.map((a, j) => (
                      <div key={j} className="flex items-start gap-2 text-xs text-neutral-700">
                        <ChevronRight size={10} className="text-teal-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <span>{a.action}</span>
                          {a.deadline && <span className="text-neutral-400 ml-1">({a.deadline})</span>}
                        </div>
                        {a.owner_type && <span className="badge badge-gray text-[9px] flex-shrink-0">{a.owner_type}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {phase.milestone && (
                  <div className="text-[10px] text-teal-700 font-semibold bg-teal-50 px-2 py-1 rounded inline-block">
                    Jalon : {phase.milestone}
                  </div>
                )}
              </div>
            ))}
          </div>
          {c.roadmap.dependencies && c.roadmap.dependencies.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div className="text-[10px] font-semibold text-amber-700 uppercase mb-1">Dépendances</div>
              <ul className="space-y-0.5">
                {c.roadmap.dependencies.map((d, i) => (
                  <li key={i} className="text-xs text-amber-800">{d}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Analyse de risques */}
      {c.risk_analysis && c.risk_analysis.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <CircleAlert size={16} className="text-red-600" />
            Analyse de risques
          </h2>
          <div className="space-y-2">
            {c.risk_analysis.map((r, i) => (
              <div key={i} className={`p-3 rounded-lg border ${
                r.probability === 'high' || r.impact === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                    r.probability === 'high' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                  }`}>P:{r.probability}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                    r.impact === 'high' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'
                  }`}>I:{r.impact}</span>
                  {r.risk_score && (
                    <span className="text-[10px] font-bold text-neutral-500">Score: {r.risk_score}/10</span>
                  )}
                </div>
                <p className="text-xs text-neutral-900 font-medium">{r.risk}</p>
                {r.mitigation && (
                  <div className="mt-1.5 flex items-start gap-1">
                    <Shield size={10} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-emerald-800">{r.mitigation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Partenariats recommandés */}
      {c.partnership_recommendations && c.partnership_recommendations.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Handshake size={16} className="text-blue-600" />
            Partenariats stratégiques recommandés
          </h2>
          <div className="space-y-2">
            {c.partnership_recommendations.map((p, i) => (
              <div key={i} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100">
                <div className="flex items-center gap-2 mb-1">
                  <PriorityBadge p={p.priority} />
                  {p.model && <span className="badge badge-blue text-[9px]">{p.model}</span>}
                </div>
                <p className="text-xs text-neutral-900 font-medium">{p.partner_type}</p>
                {p.rationale && <p className="text-[11px] text-neutral-600 mt-1">{p.rationale}</p>}
                {p.potential_partners && p.potential_partners.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.potential_partners.map((pp, j) => (
                      <span key={j} className="badge badge-purple text-[9px]">{pp}</span>
                    ))}
                  </div>
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

      {/* ══════════ AGENT 5 : PRÉDICTIONS ══════════ */}

      {c.predictions_by_company && c.predictions_by_company.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <Crosshair size={16} className="text-indigo-600" />
            Prédictions par entreprise
            {c.mirofish_used && (
              <span className="badge badge-purple text-[9px] ml-1">Enrichi par MiroFish</span>
            )}
          </h2>
          <div className="space-y-5">
            {c.predictions_by_company.map((pred, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-neutral-50 border border-neutral-200">
                <h3 className="text-sm font-bold text-neutral-900 mb-3">{pred.company}</h3>

                {/* Prochain mouvement anticipé */}
                {pred.next_moves && pred.next_moves.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Crosshair size={10} /> Prochains mouvements anticipés
                    </div>
                    <div className="space-y-2">
                      {pred.next_moves.map((m, i) => (
                        <div key={i} className="p-2.5 bg-white rounded-lg border border-neutral-100">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-xs font-medium text-neutral-900">{m.move}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {m.probability && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-bold">{m.probability}</span>
                              )}
                              {m.confidence && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  m.confidence === 'high' ? 'bg-green-50 text-green-700' :
                                  m.confidence === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-500'
                                }`}>{m.confidence === 'high' ? 'Confiance haute' : m.confidence === 'medium' ? 'Confiance moyenne' : 'Confiance faible'}</span>
                              )}
                            </div>
                          </div>
                          {m.timing && <div className="text-[10px] text-neutral-500 mb-1">Timing : {m.timing}</div>}
                          {m.impact_on_market && <div className="text-[11px] text-neutral-600">{m.impact_on_market}</div>}
                          {m.supporting_signals && m.supporting_signals.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {m.supporting_signals.map((s, j) => (
                                <span key={j} className="text-[9px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded">{s}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Intention stratégique */}
                {pred.strategic_intention && (
                  <div className="mb-3">
                    <div className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Target size={10} /> Intention stratégique déduite
                    </div>
                    <div className="p-2.5 bg-indigo-50/50 rounded-lg border border-indigo-100">
                      <div className="text-xs font-medium text-neutral-900 mb-1">{pred.strategic_intention.primary_objective}</div>
                      {pred.strategic_intention.strategy_type && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-medium">
                          {pred.strategic_intention.strategy_type}
                        </span>
                      )}
                      {pred.strategic_intention.alliances_anticipated && pred.strategic_intention.alliances_anticipated.length > 0 && (
                        <div className="mt-2">
                          <span className="text-[10px] font-semibold text-neutral-500">Alliances anticipées : </span>
                          <span className="text-[11px] text-neutral-700">{pred.strategic_intention.alliances_anticipated.join(', ')}</span>
                        </div>
                      )}
                      {pred.strategic_intention.conflicts_emerging && pred.strategic_intention.conflicts_emerging.length > 0 && (
                        <div className="mt-1">
                          <span className="text-[10px] font-semibold text-red-600">Conflits émergents : </span>
                          <span className="text-[11px] text-neutral-700">{pred.strategic_intention.conflicts_emerging.join(', ')}</span>
                        </div>
                      )}
                      {pred.strategic_intention.evidence && pred.strategic_intention.evidence.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {pred.strategic_intention.evidence.map((e, j) => (
                            <div key={j} className="text-[10px] text-neutral-500 flex items-start gap-1">
                              <span className="text-indigo-400 mt-0.5 flex-shrink-0">-</span> {e}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Contre-positionnement */}
                {pred.counter_positioning && pred.counter_positioning.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Shield size={10} /> Contre-positionnement recommandé
                    </div>
                    <div className="space-y-2">
                      {pred.counter_positioning.map((cp, i) => (
                        <div key={i} className="p-2.5 bg-green-50/50 rounded-lg border border-green-100">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-xs text-neutral-700 italic">{cp.scenario}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {cp.priority && <PriorityBadge p={cp.priority} />}
                              {cp.type && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                  cp.type === 'offensive' ? 'bg-red-100 text-red-700' :
                                  cp.type === 'defensive' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>{cp.type}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-xs font-medium text-neutral-900 mb-0.5">{cp.recommended_action}</div>
                          {cp.urgency && <div className="text-[10px] text-neutral-500">Urgence : {cp.urgency === 'immediate' ? 'Immédiate' : cp.urgency === 'short_term' ? 'Court terme' : 'Moyen terme'}</div>}
                          {cp.expected_outcome && <div className="text-[10px] text-green-700 mt-1">{cp.expected_outcome}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Prédictions marché */}
      {c.market_predictions && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-amber-600" />
            Prédictions de marché
          </h2>
          {c.market_predictions.consolidation_probability && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100 mb-3">
              <span className="text-xs font-medium text-amber-800">
                Probabilité de consolidation : {c.market_predictions.consolidation_probability}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {c.market_predictions.disruption_risks && c.market_predictions.disruption_risks.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">Risques de disruption</div>
                <ul className="space-y-1">
                  {c.market_predictions.disruption_risks.map((r, i) => (
                    <li key={i} className="text-xs text-neutral-700 flex items-start gap-1.5">
                      <AlertTriangle size={10} className="text-red-400 mt-0.5 flex-shrink-0" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {c.market_predictions.emerging_opportunities && c.market_predictions.emerging_opportunities.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1.5">Opportunités émergentes</div>
                <ul className="space-y-1">
                  {c.market_predictions.emerging_opportunities.map((o, i) => (
                    <li key={i} className="text-xs text-neutral-700 flex items-start gap-1.5">
                      <TrendingUp size={10} className="text-green-500 mt-0.5 flex-shrink-0" /> {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {c.market_predictions.key_inflection_points && c.market_predictions.key_inflection_points.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold text-neutral-600 uppercase tracking-wide mb-2">Points d&apos;inflexion</div>
              <div className="space-y-2">
                {c.market_predictions.key_inflection_points.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-neutral-50 rounded-lg">
                    <Clock size={12} className="text-neutral-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-neutral-900">{p.event}</div>
                      <div className="text-[10px] text-neutral-500">{p.timing} · Probabilité : {p.probability}</div>
                      {p.implications && <div className="text-[10px] text-neutral-600 mt-0.5">{p.implications}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Matrice de confiance */}
      {c.confidence_matrix && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Shield size={16} className="text-neutral-600" />
            Matrice de confiance
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            {c.confidence_matrix.overall_confidence && (
              <div className="p-3 bg-neutral-50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 mb-1">Confiance globale</div>
                <div className={`text-sm font-bold ${
                  c.confidence_matrix.overall_confidence === 'high' ? 'text-green-700' :
                  c.confidence_matrix.overall_confidence === 'medium' ? 'text-amber-700' : 'text-red-700'
                }`}>{c.confidence_matrix.overall_confidence === 'high' ? 'Haute' : c.confidence_matrix.overall_confidence === 'medium' ? 'Moyenne' : 'Faible'}</div>
              </div>
            )}
            {c.confidence_matrix.data_quality && (
              <div className="p-3 bg-neutral-50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 mb-1">Qualité des données</div>
                <div className="text-sm font-bold text-neutral-900">{c.confidence_matrix.data_quality === 'high' ? 'Haute' : c.confidence_matrix.data_quality === 'medium' ? 'Moyenne' : 'Faible'}</div>
              </div>
            )}
            {c.confidence_matrix.prediction_horizon && (
              <div className="p-3 bg-neutral-50 rounded-lg text-center">
                <div className="text-[10px] text-neutral-500 mb-1">Horizon</div>
                <div className="text-sm font-bold text-neutral-900">{c.confidence_matrix.prediction_horizon}</div>
              </div>
            )}
          </div>
          {c.confidence_matrix.key_assumptions && c.confidence_matrix.key_assumptions.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-1">Hypothèses clés</div>
              <ul className="space-y-0.5">
                {c.confidence_matrix.key_assumptions.map((a, i) => (
                  <li key={i} className="text-xs text-neutral-700">- {a}</li>
                ))}
              </ul>
            </div>
          )}
          {c.confidence_matrix.blind_spots && c.confidence_matrix.blind_spots.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1">Zones aveugles</div>
              <ul className="space-y-0.5">
                {c.confidence_matrix.blind_spots.map((b, i) => (
                  <li key={i} className="text-xs text-neutral-700 flex items-start gap-1">
                    <AlertTriangle size={9} className="text-red-400 mt-0.5 flex-shrink-0" /> {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      {(typeof c.signals_analyzed === 'number' || c.report_sequence) && (
        <p className="text-[11px] text-neutral-400 mt-4">
          {c.report_sequence && c.report_sequence > 1 && (
            <span className="inline-flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
              Rapport #{c.report_sequence}
            </span>
          )}
          {typeof c.signals_analyzed === 'number' && (
            <span>
              {c.signals_analyzed} signal{c.signals_analyzed > 1 ? 'ux' : ''} analysé
              {c.signals_analyzed > 1 ? 's' : ''}
            </span>
          )}
        </p>
      )}
    </div>

    {/* Chat IA */}
    <ReportChat
      reportId={params.reportId}
      watchId={params.id}
      reportTitle={title}
    />
    </div>
  )
}
