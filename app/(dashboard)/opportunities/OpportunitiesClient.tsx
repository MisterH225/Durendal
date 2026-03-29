'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Target, Flame, TrendingUp, Search, SlidersHorizontal, RefreshCw, ChevronDown,
  Building2, MapPin, Calendar, Users, ArrowUpRight, Filter, LayoutList, LayoutGrid,
  Loader2, Zap, AlertCircle, X,
} from 'lucide-react'
import OpportunityDetail from './OpportunityDetail'

// ── Types ────────────────────────────────────────────────────────────────────

interface Opportunity {
  id: string
  title: string
  summary: string
  total_score: number
  fit_score: number
  intent_score: number
  recency_score: number
  engagement_score: number
  reachability_score: number
  confidence_score: number
  noise_penalty: number
  heat_level: 'hot' | 'warm' | 'cold'
  status: string
  recommended_angle: string
  last_signal_at: string | null
  created_at: string
  score_breakdown: any
  tags: string[]
  companies: {
    id: string; name: string; sector: string | null; country: string | null
    website: string | null; logo_url: string | null; employee_range: string | null
    company_type: string | null
  }
  watches: { id: string; name: string } | null
}

interface Stats { total: number; hot: number; warm: number; new: number }

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:         { label: 'Nouveau',     color: 'bg-blue-100 text-blue-700' },
  contacted:   { label: 'Contacté',    color: 'bg-amber-100 text-amber-700' },
  qualified:   { label: 'Qualifié',    color: 'bg-purple-100 text-purple-700' },
  proposal:    { label: 'Proposition', color: 'bg-indigo-100 text-indigo-700' },
  negotiation: { label: 'Négociation', color: 'bg-orange-100 text-orange-700' },
  won:         { label: 'Gagné',       color: 'bg-green-100 text-green-700' },
  lost:        { label: 'Perdu',       color: 'bg-red-100 text-red-700' },
  dismissed:   { label: 'Écarté',      color: 'bg-neutral-200 text-neutral-600' },
  too_early:   { label: 'Trop tôt',    color: 'bg-yellow-100 text-yellow-700' },
}

const HEAT_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  hot:  { label: 'Chaud', icon: '🔥', color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
  warm: { label: 'Tiède', icon: '🟡', color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  cold: { label: 'Froid', icon: '🔵', color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
}

function timeAgo(d: string | null) {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days}j`
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function ScoreBar({ value, max = 100, color = 'bg-blue-600' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  )
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function OpportunitiesClient() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, hot: 0, warm: 0, new: 0 })
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Filtres
  const [search, setSearch] = useState('')
  const [heatFilter, setHeatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('total_score')
  const [showFilters, setShowFilters] = useState(false)

  const fetchOpps = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', sort: sortBy, dir: 'desc' })
      if (search) params.set('q', search)
      if (heatFilter) params.set('heat', heatFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/opportunities?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur serveur')

      setOpportunities(data.opportunities || [])
      setStats(data.stats || { total: 0, hot: 0, warm: 0, new: 0 })
      setTotalPages(data.pagination?.pages || 1)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [page, search, heatFilter, statusFilter, sortBy])

  useEffect(() => { fetchOpps() }, [fetchOpps])

  async function handleCompute() {
    setComputing(true)
    try {
      const res = await fetch('/api/opportunities', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      fetchOpps()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setComputing(false)
    }
  }

  function handleStatusChange(oppId: string, newStatus: string) {
    setOpportunities(prev => prev.map(o => o.id === oppId ? { ...o, status: newStatus } : o))
  }

  return (
    <div className="pb-20 lg:pb-0">
      {/* Header métriques */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-base font-bold text-neutral-900">Opportunités commerciales</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Leads priorisés à partir de vos veilles</p>
        </div>
        <button
          onClick={handleCompute}
          disabled={computing}
          className="btn-primary flex items-center gap-1.5 text-xs"
        >
          {computing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {computing ? 'Calcul en cours...' : 'Recalculer les scores'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total', value: stats.total, icon: Target, color: 'text-blue-600' },
          { label: 'Chauds', value: stats.hot, icon: Flame, color: 'text-red-500' },
          { label: 'Tièdes', value: stats.warm, icon: TrendingUp, color: 'text-amber-500' },
          { label: 'Nouveaux', value: stats.new, icon: Zap, color: 'text-green-600' },
        ].map(m => (
          <div key={m.label} className="metric-card flex items-center gap-3">
            <m.icon size={18} className={m.color} />
            <div>
              <div className="text-lg font-bold text-neutral-900">{m.value}</div>
              <div className="text-[10px] text-neutral-500 font-medium">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Barre de filtres */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              className="input pl-9 py-2 text-xs"
              placeholder="Rechercher entreprise, signal..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          {/* Heat filter pills */}
          <div className="flex gap-1">
            {['', 'hot', 'warm', 'cold'].map(h => (
              <button key={h} onClick={() => { setHeatFilter(h); setPage(1) }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                  heatFilter === h ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'
                }`}>
                {h === '' ? 'Tous' : HEAT_CONFIG[h]?.label}
              </button>
            ))}
          </div>

          {/* Status dropdown */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="input py-1.5 text-xs w-auto pr-8"
          >
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="input py-1.5 text-xs w-auto pr-8"
          >
            <option value="total_score">Score global</option>
            <option value="last_signal_at">Dernier signal</option>
            <option value="fit_score">Score Fit</option>
            <option value="intent_score">Score Intent</option>
            <option value="created_at">Date détection</option>
          </select>

          {/* View toggle */}
          <div className="flex border border-neutral-200 rounded-lg overflow-hidden">
            <button onClick={() => setView('table')}
              className={`p-1.5 ${view === 'table' ? 'bg-blue-700 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}>
              <LayoutList size={14} />
            </button>
            <button onClick={() => setView('cards')}
              className={`p-1.5 ${view === 'cards' ? 'bg-blue-700 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}>
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-400">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-xs">Chargement des opportunités...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && opportunities.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Target size={28} className="text-neutral-300" />
          </div>
          <p className="text-sm font-medium text-neutral-600 mb-1">Aucune opportunité détectée</p>
          <p className="text-xs text-neutral-400 mb-4 max-w-md mx-auto">
            Les opportunités sont générées automatiquement à partir des signaux de vos veilles.
            Lancez un recalcul ou ajoutez des veilles avec des entreprises.
          </p>
          <button onClick={handleCompute} disabled={computing} className="btn-primary text-xs">
            {computing ? 'Calcul...' : 'Détecter les opportunités'}
          </button>
        </div>
      )}

      {/* Vue Table */}
      {!loading && opportunities.length > 0 && view === 'table' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-2.5 px-3 font-semibold text-neutral-500 w-[260px]">Entreprise</th>
                <th className="text-center py-2.5 px-2 font-semibold text-neutral-500 w-[70px]">Score</th>
                <th className="text-center py-2.5 px-2 font-semibold text-neutral-500 w-[60px]">Chaleur</th>
                <th className="text-left py-2.5 px-2 font-semibold text-neutral-500 hidden lg:table-cell">Angle d'approche</th>
                <th className="text-left py-2.5 px-2 font-semibold text-neutral-500 w-[100px] hidden md:table-cell">Veille</th>
                <th className="text-center py-2.5 px-2 font-semibold text-neutral-500 w-[80px]">Signal</th>
                <th className="text-center py-2.5 px-2 font-semibold text-neutral-500 w-[90px]">Statut</th>
                <th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map(opp => {
                const heat = HEAT_CONFIG[opp.heat_level] || HEAT_CONFIG.cold
                const st = STATUS_LABELS[opp.status] || STATUS_LABELS.new
                return (
                  <tr key={opp.id}
                    onClick={() => setSelectedId(opp.id)}
                    className="border-b border-neutral-100 hover:bg-blue-50/40 cursor-pointer transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        {opp.companies?.logo_url ? (
                          <img src={opp.companies.logo_url} alt="" className="w-7 h-7 rounded-lg object-contain bg-white border border-neutral-200 flex-shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] font-bold text-blue-600">{opp.companies?.name?.slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-neutral-900 truncate">{opp.companies?.name}</div>
                          <div className="text-[10px] text-neutral-400 truncate">
                            {[opp.companies?.sector, opp.companies?.country].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <div className="font-bold text-neutral-900">{opp.total_score}</div>
                      <ScoreBar value={opp.total_score} color={opp.total_score >= 75 ? 'bg-red-500' : opp.total_score >= 50 ? 'bg-amber-500' : 'bg-blue-500'} />
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${heat.bg}`}>
                        {heat.icon} {heat.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 hidden lg:table-cell">
                      <div className="text-neutral-600 truncate max-w-[200px]">{opp.recommended_angle || '—'}</div>
                    </td>
                    <td className="py-2.5 px-2 hidden md:table-cell">
                      <span className="text-neutral-500 truncate">{opp.watches?.name || '—'}</span>
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <span className="text-neutral-500">{timeAgo(opp.last_signal_at)}</span>
                    </td>
                    <td className="text-center py-2.5 px-2">
                      <span className={`badge text-[10px] ${st.color}`}>{st.label}</span>
                    </td>
                    <td className="py-2.5 px-1">
                      <ArrowUpRight size={13} className="text-neutral-400" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Vue Cards */}
      {!loading && opportunities.length > 0 && view === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {opportunities.map(opp => {
            const heat = HEAT_CONFIG[opp.heat_level] || HEAT_CONFIG.cold
            const st = STATUS_LABELS[opp.status] || STATUS_LABELS.new
            return (
              <div key={opp.id}
                onClick={() => setSelectedId(opp.id)}
                className="card hover:shadow-md cursor-pointer transition-all group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {opp.companies?.logo_url ? (
                      <img src={opp.companies.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-white border border-neutral-200 flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                        <Building2 size={14} className="text-blue-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 truncate group-hover:text-blue-700 transition-colors">{opp.companies?.name}</div>
                      <div className="text-[10px] text-neutral-400">{[opp.companies?.sector, opp.companies?.country].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-neutral-900">{opp.total_score}</div>
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${heat.color}`}>
                      {heat.icon} {heat.label}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-600 line-clamp-2 mb-2">{opp.recommended_angle}</p>

                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <span className="flex items-center gap-0.5"><Calendar size={10} /> {timeAgo(opp.last_signal_at)}</span>
                    {opp.watches?.name && <span>{opp.watches.name}</span>}
                  </div>
                  <span className={`badge text-[9px] ${st.color}`}>{st.label}</span>
                </div>

                {/* Mini score bars */}
                <div className="mt-2 pt-2 border-t border-neutral-100 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Fit', value: opp.fit_score, color: 'bg-blue-500' },
                    { label: 'Intent', value: opp.intent_score, color: 'bg-purple-500' },
                    { label: 'Récence', value: opp.recency_score, color: 'bg-green-500' },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-[9px] text-neutral-400 mb-0.5">
                        <span>{s.label}</span><span>{s.value}</span>
                      </div>
                      <ScoreBar value={s.value} color={s.color} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30">← Précédent</button>
          <span className="text-xs text-neutral-500">Page {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30">Suivant →</button>
        </div>
      )}

      {/* Drawer Détail */}
      {selectedId && (
        <OpportunityDetail
          opportunityId={selectedId}
          onClose={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
