'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Settings2, Zap, FileText, Globe, ExternalLink, Plus,
  Search, BrainCircuit, BarChart2, Newspaper, ChevronRight,
  Building2, MapPin, Layers, Clock, Calendar, Sparkles,
  Loader2, AlertTriangle, Lightbulb, ShieldAlert, Target, X,
} from 'lucide-react'
import ScanHistory from './ScanHistory'
import SignalAnalysisPanel from '@/components/veille/SignalAnalysisPanel'

const SUB_AGENT_ICONS: Record<string, any> = {
  web_scanner: Globe, press_monitor: Newspaper, analyst: BarChart2,
  deep_research: Search, deep_research_iterative: BrainCircuit,
}

const TABS = [
  { id: 'params',  label: 'Paramètres', icon: Settings2 },
  { id: 'signals', label: 'Signaux',    icon: Zap },
  { id: 'reports', label: 'Rapports',   icon: FileText },
] as const

type TabId = typeof TABS[number]['id']

interface Props {
  watchId: string; watch: any; companies: any[]; signals: any[]
  totalSignals: number; reports: any[]; jobs: any[]
  breakdown: Record<string, number> | undefined
}

function fmtDateShort(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function isRecentCollect(pubAt: string | null, collectedAt: string | null): boolean {
  if (!pubAt || !collectedAt) return true
  return Math.abs(new Date(pubAt).getTime() - new Date(collectedAt).getTime()) < 60_000
}

export default function WatchTabs({ watchId, watch, companies, signals, totalSignals, reports, jobs, breakdown }: Props) {
  const [tab, setTab] = useState<TabId>('signals')

  return (
    <>
      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-neutral-800/50 rounded-xl p-1 mb-5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          const count = id === 'signals' ? totalSignals : id === 'reports' ? reports.length : companies.length
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                active ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <Icon size={13} />
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                active ? 'bg-blue-500/20 text-blue-400' : 'bg-neutral-800 text-neutral-600'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {tab === 'params' && <TabParams watchId={watchId} watch={watch} companies={companies} jobs={jobs} breakdown={breakdown} />}
      {tab === 'signals' && <TabSignals signals={signals} totalSignals={totalSignals} watchId={watchId} noCompanies={companies.length === 0} />}
      {tab === 'reports' && <TabReports reports={reports} watchId={watchId} />}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB: Paramètres
// ═══════════════════════════════════════════════════════════════════════════════

function TabParams({ watchId, watch, companies, jobs, breakdown }: {
  watchId: string; watch: any; companies: any[]; jobs: any[]
  breakdown: Record<string, number> | undefined
}) {
  const lastScrapeJob = (jobs ?? []).find((j: any) => j.agent_number === 1)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white">Configuration</h3>
          <Link href={`/forecast/veille/watches/${watchId}/edit`} className="text-[10px] font-semibold text-blue-400 hover:text-blue-300">Modifier</Link>
        </div>
        <div className="space-y-3">
          {[
            { icon: Layers, label: 'Secteurs', value: watch.sectors?.length > 0 ? watch.sectors.join(', ') : '—' },
            { icon: MapPin, label: 'Pays', value: watch.countries?.length > 0 ? watch.countries.join(', ') : '—' },
            { icon: Clock, label: 'Fréquence', value: watch.frequency === 'realtime' ? 'Temps réel' : watch.frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-2">
              <Icon size={13} className="text-neutral-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide font-semibold">{label}</div>
                <div className="text-xs text-neutral-300 mt-0.5">{value}</div>
              </div>
            </div>
          ))}
          {watch.last_run_at && (
            <div className="flex items-start gap-2">
              <Zap size={13} className="text-neutral-600 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide font-semibold">Dernier scan</div>
                <div className="text-xs text-neutral-300 mt-0.5">{fmtDate(watch.last_run_at)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Building2 size={14} className="text-blue-400" />
            Entreprises ({companies.length})
          </h3>
          <Link href={`/forecast/veille/watches/${watchId}/edit`} className="text-[10px] text-blue-400 hover:text-blue-300">Modifier</Link>
        </div>
        {companies.length > 0 ? (
          <div className="space-y-2">
            {companies.map((co: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-neutral-800/50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {co?.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-neutral-200 truncate">{co?.name}</div>
                  <div className="text-[10px] text-neutral-500">{[co?.sector, co?.country].filter(Boolean).join(' · ')}</div>
                </div>
                {co?.website && (
                  <a href={co.website} target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:text-blue-400 transition-colors flex-shrink-0">
                    <Globe size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Link href={`/forecast/veille/watches/${watchId}/edit`}
            className="flex items-center justify-center gap-1.5 w-full py-6 border-2 border-dashed border-neutral-700 rounded-lg text-xs text-neutral-500 hover:border-blue-500/30 hover:text-blue-400 transition-colors">
            <Plus size={14} /> Ajouter des entreprises
          </Link>
        )}
      </div>

      <div className="lg:col-span-2"><ScanHistory jobs={jobs ?? []} /></div>

      {breakdown && lastScrapeJob?.metadata?.collector === 'gemini-search-grounding' && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 lg:col-span-2">
          <h3 className="text-sm font-bold text-white mb-3">Breakdown dernier scan</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: 'signals_count', label: 'Signaux', icon: Zap, color: 'text-emerald-400' },
              { key: 'grounding_sources', label: 'Sources Google', icon: Globe, color: 'text-blue-400' },
              { key: 'analyses_generated', label: 'Analyses IA', icon: BrainCircuit, color: 'text-violet-400' },
            ].map(item => {
              const val = lastScrapeJob.metadata?.[item.key] ?? 0
              const Icon = item.icon
              return (
                <div key={item.key} className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 text-center">
                  <Icon size={16} className={`${item.color} mx-auto mb-1`} />
                  <div className="text-lg font-bold text-white">{val}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">{item.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB: Signaux (with category filters)
// ═══════════════════════════════════════════════════════════════════════════════

function TabSignals({ signals, totalSignals, watchId, noCompanies }: {
  signals: any[]; totalSignals: number; watchId: string; noCompanies: boolean
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [synthesis, setSynthesis] = useState<any>(null)
  const [synthLoading, setSynthLoading] = useState(false)
  const [synthError, setSynthError] = useState<string | null>(null)

  const categories = useMemo(() => {
    const cats = signals.map(s => s.category).filter(Boolean) as string[]
    return [...new Set(cats)]
  }, [signals])

  const filtered = activeCategory
    ? signals.filter(s => s.category === activeCategory)
    : signals

  const handleSynthesis = useCallback(async () => {
    setSynthLoading(true)
    setSynthError(null)
    setSynthesis(null)
    try {
      const res = await fetch('/api/veille/synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId, category: activeCategory }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur')
      setSynthesis(json.synthesis)
    } catch (e: any) {
      setSynthError(e.message ?? 'Erreur lors de la synthèse')
    } finally {
      setSynthLoading(false)
    }
  }, [watchId, activeCategory])

  if (!signals || signals.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 flex flex-col items-center py-14 text-center">
        <Zap size={28} className="text-neutral-700 mb-3" />
        <p className="text-sm text-neutral-400">Aucun signal collecté.</p>
        <p className="text-xs text-neutral-500 mt-1">
          {noCompanies ? 'Ajoutez des entreprises puis lancez le scan.' : 'Cliquez sur "Lancer le scan" pour démarrer.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-white">
          {activeCategory ? `${filtered.length} signal${filtered.length > 1 ? 'ux' : ''} — ${activeCategory}` : `${totalSignals} signal${totalSignals > 1 ? 'ux' : ''} collecté${totalSignals > 1 ? 's' : ''}`}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSynthesis}
            disabled={synthLoading}
            className="flex items-center gap-1.5 text-[10px] font-semibold px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
          >
            {synthLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {activeCategory ? `Synthèse : ${activeCategory}` : 'Synthèse globale'}
          </button>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Zap size={9} className="inline mr-0.5" />Live
          </span>
        </div>
      </div>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => { setActiveCategory(null); setSynthesis(null); setSynthError(null) }}
            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
              !activeCategory ? 'bg-white text-neutral-900 border-white' : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-600 hover:text-neutral-300'
            }`}
          >
            Tout ({signals.length})
          </button>
          {categories.map(cat => {
            const count = signals.filter(s => s.category === cat).length
            return (
              <button
                key={cat}
                onClick={() => { setActiveCategory(activeCategory === cat ? null : cat); setSynthesis(null); setSynthError(null) }}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-neutral-600 hover:text-neutral-300'
                }`}
              >
                {cat} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Synthesis result */}
      {synthError && (
        <div className="mb-4 p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400 flex items-center gap-2">
          <AlertTriangle size={14} />
          {synthError}
          <button onClick={() => setSynthError(null)} className="ml-auto text-red-500 hover:text-red-300"><X size={12} /></button>
        </div>
      )}

      {synthLoading && (
        <div className="mb-4 p-6 rounded-xl border border-violet-500/20 bg-violet-500/5 flex items-center justify-center gap-2 text-sm text-violet-400">
          <Loader2 size={16} className="animate-spin" />
          Analyse en cours{activeCategory ? ` pour « ${activeCategory} »` : ''}…
        </div>
      )}

      {synthesis && !synthLoading && (
        <div className="mb-5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-violet-300 flex items-center gap-1.5">
              <Sparkles size={14} />
              {synthesis.title ?? 'Synthèse IA'}
            </h4>
            <button onClick={() => setSynthesis(null)} className="text-neutral-600 hover:text-neutral-400"><X size={14} /></button>
          </div>
          {synthesis.executive_summary && (
            <p className="text-xs text-neutral-300 leading-relaxed mb-4">{synthesis.executive_summary}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {synthesis.key_findings?.length > 0 && (
              <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Target size={11} className="text-blue-400" /> Constats clés
                </h5>
                <ul className="space-y-1">
                  {synthesis.key_findings.map((f: string, i: number) => (
                    <li key={i} className="text-[11px] text-neutral-400 leading-relaxed flex gap-1.5">
                      <span className="text-blue-500 font-bold mt-0.5">•</span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {synthesis.opportunities?.length > 0 && (
              <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Lightbulb size={11} className="text-emerald-400" /> Opportunités
                </h5>
                <ul className="space-y-1">
                  {synthesis.opportunities.map((o: string, i: number) => (
                    <li key={i} className="text-[11px] text-neutral-400 leading-relaxed flex gap-1.5">
                      <span className="text-emerald-500 font-bold mt-0.5">•</span>{o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {synthesis.risks?.length > 0 && (
              <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <ShieldAlert size={11} className="text-red-400" /> Risques
                </h5>
                <ul className="space-y-1">
                  {synthesis.risks.map((r: string, i: number) => (
                    <li key={i} className="text-[11px] text-neutral-400 leading-relaxed flex gap-1.5">
                      <span className="text-red-500 font-bold mt-0.5">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {synthesis.recommendations?.length > 0 && (
              <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800">
                <h5 className="text-[10px] font-bold text-white uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Target size={11} className="text-violet-400" /> Recommandations
                </h5>
                <ul className="space-y-1">
                  {synthesis.recommendations.map((r: string, i: number) => (
                    <li key={i} className="text-[11px] text-neutral-400 leading-relaxed flex gap-1.5">
                      <span className="text-violet-500 font-bold mt-0.5">•</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {synthesis.signals_analyzed && (
            <p className="text-[10px] text-neutral-600 mt-3 text-right">{synthesis.signals_analyzed} signaux analysés</p>
          )}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((s: any) => {
          const hasPubDate = s.published_at && !isRecentCollect(s.published_at, s.collected_at)
          const sigData = (s.data ?? {}) as Record<string, any>
          const imageUrl = sigData.image_url ?? null
          const aiAnalysis = sigData.ai_analysis ?? null

          return (
            <div key={s.id} className={`pb-3 rounded-xl border p-3 ${
              s.severity === 'high' ? 'border-red-500/20 bg-red-500/5' :
              s.severity === 'low' ? 'border-emerald-500/20 bg-emerald-500/5' :
              'border-neutral-800 bg-neutral-900/30'
            }`}>
              <div className="flex gap-3">
                {imageUrl && (
                  <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-neutral-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-[10px] text-neutral-500 flex items-center gap-1 flex-wrap">
                      {s.source_name && <span className="font-medium text-neutral-400">{s.source_name}</span>}
                      {s.source_name && <span>·</span>}
                      {hasPubDate ? (
                        <span className="flex items-center gap-0.5">
                          <Calendar size={9} className="text-blue-400" />
                          {fmtDateShort(s.published_at)}
                        </span>
                      ) : (
                        <span>{fmtDate(s.collected_at || s.published_at)}</span>
                      )}
                      {s.region && <span className="text-neutral-600">· {s.region}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {s.category && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {s.category}
                        </span>
                      )}
                      {s.severity && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                          s.severity === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          s.severity === 'low' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          'bg-neutral-800 text-neutral-400 border-neutral-700'
                        }`}>{s.severity}</span>
                      )}
                      {s.signal_type && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700">
                          {s.signal_type}
                        </span>
                      )}
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-neutral-600 hover:text-blue-400 transition-colors">
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                  {s.title && <p className="text-xs font-semibold text-neutral-200 mb-1">{s.title}</p>}
                  <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">{s.raw_content?.slice(0, 200)}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    {s.companies?.name && <span className="text-[11px] text-blue-400 font-medium">{s.companies.name}</span>}
                    {s.relevance_score != null && (
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${
                            s.relevance_score >= 0.7 ? 'bg-emerald-500' : s.relevance_score >= 0.5 ? 'bg-amber-500' : 'bg-neutral-600'
                          }`} style={{ width: `${s.relevance_score * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-neutral-600">{Math.round(s.relevance_score * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <SignalAnalysisPanel analysis={aiAnalysis} />
            </div>
          )
        })}
      </div>

      {totalSignals > signals.length && (
        <div className="text-center mt-4 pt-3 border-t border-neutral-800">
          <span className="text-[11px] text-neutral-600">Affichage des {signals.length} derniers sur {totalSignals}</span>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB: Rapports
// ═══════════════════════════════════════════════════════════════════════════════

function TabReports({ reports, watchId }: { reports: any[]; watchId: string }) {
  if (!reports || reports.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 flex flex-col items-center py-14 text-center">
        <FileText size={28} className="text-neutral-700 mb-3" />
        <p className="text-sm text-neutral-400">Aucun rapport généré.</p>
        <p className="text-xs text-neutral-500 mt-1">Lancez un scan — le rapport est généré automatiquement.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <h3 className="text-sm font-bold text-white mb-4">
        {reports.length} rapport{reports.length > 1 ? 's' : ''} généré{reports.length > 1 ? 's' : ''}
      </h3>
      <div className="space-y-2">
        {reports.map((r: any) => {
          const excerpt = typeof r.summary === 'string' && r.summary.length > 0 && !r.summary.includes('```')
            ? `${r.summary.slice(0, 120)}${r.summary.length > 120 ? '…' : ''}`
            : null
          return (
            <Link
              key={r.id}
              href={`/forecast/veille/watches/${watchId}/reports/${r.id}`}
              className="flex items-center gap-3 p-4 rounded-xl border border-neutral-800 bg-neutral-900/30 hover:border-neutral-700 hover:bg-neutral-800/50 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0">
                <FileText size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-neutral-200 truncate group-hover:text-white">{r.title}</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">
                  {r.type === 'synthesis' || r.type === 'analyse' ? 'Analyse concurrentielle' :
                   r.type === 'market' ? 'Analyse marché' :
                   r.type === 'prediction' ? 'Prédiction' : 'Stratégie'}
                  {' · '}{fmtDate(r.generated_at ?? r.created_at)}
                </p>
                {excerpt && <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{excerpt}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {!r.is_read && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                  r.type === 'synthesis' || r.type === 'analyse' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                  r.type === 'market' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  r.type === 'prediction' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                  'bg-violet-500/10 text-violet-400 border-violet-500/20'
                }`}>Agent {r.agent_used ?? 2}</span>
              </div>
              <ChevronRight size={16} className="text-neutral-700 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
