'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Settings2, Zap, FileText, Globe, ExternalLink, Plus,
  Search, BrainCircuit, BarChart2, Newspaper, ChevronRight,
  Building2, MapPin, Layers, Clock, AlertTriangle,
} from 'lucide-react'
import ScanHistory from './ScanHistory'

const SUB_AGENT_ICONS: Record<string, any> = {
  web_scanner:             Globe,
  press_monitor:           Newspaper,
  analyst:                 BarChart2,
  deep_research:           Search,
  deep_research_iterative: BrainCircuit,
}

const TABS = [
  { id: 'params',   label: 'Paramètres', icon: Settings2 },
  { id: 'signals',  label: 'Signaux',    icon: Zap },
  { id: 'reports',  label: 'Rapports',   icon: FileText },
] as const

type TabId = typeof TABS[number]['id']

interface Props {
  watchId:      string
  watch:        any
  companies:    any[]
  signals:      any[]
  totalSignals: number
  reports:      any[]
  jobs:         any[]
  breakdown:    Record<string, number> | undefined
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export default function WatchTabs({
  watchId, watch, companies, signals, totalSignals, reports, jobs, breakdown,
}: Props) {
  const [tab, setTab] = useState<TabId>('signals')

  return (
    <>
      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-neutral-100 rounded-xl p-1 mb-5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          const count = id === 'signals' ? totalSignals
            : id === 'reports' ? reports.length
            : companies.length
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                active
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              <Icon size={13} />
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                active ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-500'
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Tab content ─────────────────────────────────────── */}

      {tab === 'params' && (
        <TabParams
          watchId={watchId} watch={watch} companies={companies}
          jobs={jobs} breakdown={breakdown}
        />
      )}
      {tab === 'signals' && (
        <TabSignals signals={signals} totalSignals={totalSignals} watchId={watchId} noCompanies={companies.length === 0} />
      )}
      {tab === 'reports' && (
        <TabReports reports={reports} watchId={watchId} />
      )}
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
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Infos veille */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-neutral-900">Configuration</h3>
          <Link href={`/veilles/${watchId}/edit`}
            className="text-[10px] font-semibold text-blue-600 hover:underline">
            Modifier
          </Link>
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Layers size={13} className="text-neutral-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide font-semibold">Secteurs</div>
              <div className="text-xs text-neutral-800 mt-0.5">
                {watch.sectors?.length > 0 ? watch.sectors.join(', ') : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={13} className="text-neutral-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide font-semibold">Pays</div>
              <div className="text-xs text-neutral-800 mt-0.5">
                {watch.countries?.length > 0 ? watch.countries.join(', ') : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock size={13} className="text-neutral-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide font-semibold">Fréquence</div>
              <div className="text-xs text-neutral-800 mt-0.5">
                {watch.frequency === 'realtime' ? 'Temps réel' : watch.frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire'}
              </div>
            </div>
          </div>
          {watch.last_run_at && (
            <div className="flex items-start gap-2">
              <Zap size={13} className="text-neutral-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wide font-semibold">Dernier scan</div>
                <div className="text-xs text-neutral-800 mt-0.5">{fmtDate(watch.last_run_at)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Entreprises */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
            <Building2 size={14} className="text-blue-700" />
            Entreprises ({companies.length})
          </h3>
          <Link href={`/veilles/${watchId}/edit`} className="text-[10px] text-blue-600 hover:underline">Modifier</Link>
        </div>
        {companies.length > 0 ? (
          <div className="space-y-2">
            {companies.map((co: any, i: number) => (
              <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-neutral-50 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {co?.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-neutral-900 truncate">{co?.name}</div>
                  <div className="text-[10px] text-neutral-400">
                    {[co?.sector, co?.country].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {co?.website && (
                  <a href={co.website} target="_blank" rel="noopener noreferrer"
                    className="text-neutral-300 hover:text-blue-500 transition-colors flex-shrink-0">
                    <Globe size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Link href={`/veilles/${watchId}/edit`}
            className="flex items-center justify-center gap-1.5 w-full py-6 border-2 border-dashed border-neutral-200 rounded-lg text-xs text-neutral-400 hover:border-blue-300 hover:text-blue-600 transition-colors">
            <Plus size={14} /> Ajouter des entreprises
          </Link>
        )}
      </div>

      {/* Historique scans */}
      <div className="lg:col-span-2">
        <ScanHistory jobs={jobs ?? []} />
      </div>

      {/* Breakdown */}
      {breakdown && (
        <div className="card-lg lg:col-span-2">
          <h3 className="text-sm font-bold text-neutral-900 mb-3">Breakdown dernier scan</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {Object.entries(breakdown).map(([key, val]) => {
              const Icon  = SUB_AGENT_ICONS[key] ?? Search
              const label = key.replace(/_/g, ' ').replace('deep research iterative', 'Deep Research IA')
              const max   = Math.max(...Object.values(breakdown), 1)
              return (
                <div key={key} className="p-3 rounded-lg bg-neutral-50 border border-neutral-100 text-center">
                  <Icon size={16} className="text-blue-600 mx-auto mb-1" />
                  <div className="text-lg font-bold text-neutral-900">{val}</div>
                  <div className="text-[10px] text-neutral-500 capitalize mt-0.5">{label}</div>
                  <div className="h-1 bg-neutral-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(val / max) * 100}%` }} />
                  </div>
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
//  TAB: Signaux
// ═══════════════════════════════════════════════════════════════════════════════

function TabSignals({ signals, totalSignals, watchId, noCompanies }: {
  signals: any[]; totalSignals: number; watchId: string; noCompanies: boolean
}) {
  if (!signals || signals.length === 0) {
    return (
      <div className="card-lg flex flex-col items-center py-14 text-center">
        <Zap size={28} className="text-neutral-200 mb-3" />
        <p className="text-sm text-neutral-500">Aucun signal collecté.</p>
        <p className="text-xs text-neutral-400 mt-1">
          {noCompanies
            ? 'Ajoutez des entreprises puis lancez le scan.'
            : 'Cliquez sur "Lancer le scan" pour démarrer les 5 agents.'}
        </p>
      </div>
    )
  }

  return (
    <div className="card-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-neutral-900">
          {totalSignals} signal{totalSignals > 1 ? 'ux' : ''} collecté{totalSignals > 1 ? 's' : ''}
        </h3>
        <span className="badge badge-blue text-[10px]">
          <Zap size={9} className="inline mr-0.5" />Live
        </span>
      </div>
      <div className="space-y-3">
        {signals.map((s: any) => (
          <div key={s.id} className="pb-3 border-b border-neutral-100 last:border-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                {s.source_name && <span className="font-medium">{s.source_name}</span>}
                {s.source_name && <span>·</span>}
                {fmtDate(s.published_at)}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {s.signal_type && (
                  <span className="badge badge-gray text-[9px]">{s.signal_type}</span>
                )}
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="text-neutral-400 hover:text-blue-600 transition-colors">
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
            {s.title && <div className="text-xs font-semibold text-neutral-900 mb-1">{s.title}</div>}
            <div className="text-xs text-neutral-600 leading-relaxed line-clamp-2">
              {s.raw_content?.slice(0, 200)}
            </div>
            <div className="flex items-center justify-between mt-1.5">
              {s.companies?.name && (
                <span className="text-[11px] text-blue-700 font-medium">{s.companies.name}</span>
              )}
              {s.relevance_score != null && (
                <div className="flex items-center gap-1">
                  <div className="w-12 h-1 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        s.relevance_score >= 0.7 ? 'bg-green-500'
                        : s.relevance_score >= 0.5 ? 'bg-amber-500'
                        : 'bg-neutral-400'
                      }`}
                      style={{ width: `${s.relevance_score * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-400">{Math.round(s.relevance_score * 100)}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {totalSignals > signals.length && (
        <div className="text-center mt-4 pt-3 border-t border-neutral-100">
          <span className="text-[11px] text-neutral-400">
            Affichage des {signals.length} derniers sur {totalSignals}
          </span>
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
      <div className="card-lg flex flex-col items-center py-14 text-center">
        <FileText size={28} className="text-neutral-200 mb-3" />
        <p className="text-sm text-neutral-500">Aucun rapport généré.</p>
        <p className="text-xs text-neutral-400 mt-1">
          Lancez un scan — le rapport est généré automatiquement après la collecte.
        </p>
      </div>
    )
  }

  return (
    <div className="card-lg">
      <h3 className="text-sm font-bold text-neutral-900 mb-4">
        {reports.length} rapport{reports.length > 1 ? 's' : ''} généré{reports.length > 1 ? 's' : ''}
      </h3>
      <div className="space-y-2">
        {reports.map((r: any) => {
          const excerpt =
            typeof r.summary === 'string' && r.summary.length > 0
              && !r.summary.includes('```')
              ? `${r.summary.slice(0, 120)}${r.summary.length > 120 ? '…' : ''}`
              : null
          return (
            <Link
              key={r.id}
              href={`/veilles/${watchId}/reports/${r.id}`}
              className="flex items-center gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200 hover:border-blue-300 hover:bg-neutral-100/80 transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
                <FileText size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-neutral-900 truncate group-hover:text-blue-800">
                  {r.title}
                </div>
                <div className="text-[10px] text-neutral-400 mt-0.5">
                  {r.type === 'synthesis' || r.type === 'analyse'
                    ? 'Analyse concurrentielle'
                    : r.type === 'market' ? 'Analyse marché' : 'Stratégie'}
                  {' · '}
                  {fmtDate(r.generated_at ?? r.created_at)}
                </div>
                {excerpt && (
                  <p className="text-[11px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{excerpt}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {!r.is_read && <span className="w-2 h-2 rounded-full bg-blue-700" title="Non lu" />}
                <span className={`badge text-[10px] ${
                  r.type === 'synthesis' || r.type === 'analyse' ? 'badge-blue'
                  : r.type === 'market' ? 'badge-green' : 'badge-purple'
                }`}>
                  Agent {r.agent_used ?? 2}
                </span>
              </div>
              <ChevronRight size={16}
                className="text-neutral-300 group-hover:text-blue-600 flex-shrink-0 transition-colors" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
