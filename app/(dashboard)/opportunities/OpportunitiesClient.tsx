'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Target, Flame, TrendingUp, Search, RefreshCw, Play,
  Building2, Calendar, ArrowUpRight, LayoutList, LayoutGrid,
  Loader2, Zap, AlertCircle, X, ShieldCheck, ShieldAlert, Shield,
  FileSearch, Radar, Globe2, Eye,
} from 'lucide-react'
import OpportunityDetail from './OpportunityDetail'
import SectorSearchPanel from './SectorSearchPanel'

// ── Types ────────────────────────────────────────────────────────────────────

interface Opportunity {
  id: string
  title: string
  summary: string
  total_score: number
  confidence_score: number
  heat_level: 'hot' | 'warm' | 'cold'
  status: string
  recommended_angle: string
  last_signal_at: string | null
  created_at: string
  score_breakdown: any
  tags: string[]
  primary_trigger_type: string | null
  primary_trigger_label: string | null
  primary_trigger_summary: string | null
  business_hypothesis: string | null
  opportunity_reason: string | null
  trigger_confidence: number
  evidence_count: number
  evidence_status: 'sufficient' | 'insufficient' | 'weak'
  display_status: string
  origin: string | null
  sector: string | null
  country: string | null
  companies: {
    id: string; name: string; sector: string | null; country: string | null
    website: string | null; logo_url: string | null; employee_range: string | null
    company_type: string | null
  } | null
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

const EVIDENCE_CONFIG: Record<string, { label: string; icon: typeof ShieldCheck; color: string }> = {
  sufficient:   { label: 'Preuves solides',    icon: ShieldCheck, color: 'text-green-600' },
  insufficient: { label: 'Preuves partielles', icon: Shield,      color: 'text-amber-600' },
  weak:         { label: 'Preuves faibles',    icon: ShieldAlert, color: 'text-neutral-400' },
}

const TRIGGER_BADGE_COLORS: Record<string, string> = {
  tender_detected:   'bg-red-50 text-red-700 border-red-200',
  project_launch:    'bg-orange-50 text-orange-700 border-orange-200',
  expansion_plan:    'bg-purple-50 text-purple-700 border-purple-200',
  hiring_spike:      'bg-blue-50 text-blue-700 border-blue-200',
  executive_change:  'bg-slate-50 text-slate-700 border-slate-200',
  partnership:       'bg-indigo-50 text-indigo-700 border-indigo-200',
  import_activity:   'bg-amber-50 text-amber-700 border-amber-200',
  funding_event:     'bg-green-50 text-green-700 border-green-200',
  new_location:      'bg-teal-50 text-teal-700 border-teal-200',
  procurement_signal:'bg-red-50 text-red-700 border-red-200',
  competitor_switch: 'bg-pink-50 text-pink-700 border-pink-200',
  product_launch:    'bg-cyan-50 text-cyan-700 border-cyan-200',
  compliance_event:  'bg-yellow-50 text-yellow-700 border-yellow-200',
  digital_activity_spike: 'bg-violet-50 text-violet-700 border-violet-200',
  distributor_appointment: 'bg-lime-50 text-lime-700 border-lime-200',
}

const SIGNAL_BADGE_LABELS: Record<string, string> = {
  tender_detected: 'Appel d\'offres',
  project_launch: 'Projet',
  expansion_plan: 'Expansion',
  hiring_spike: 'Recrutement',
  executive_change: 'Décideur',
  partnership: 'Partenariat',
  distributor_appointment: 'Distribution',
  import_activity: 'Logistique',
  funding_event: 'Levée de fonds',
  product_launch: 'Produit',
  new_location: 'Nouveau site',
  procurement_signal: 'Achat',
  competitor_switch: 'Fournisseur',
  compliance_event: 'Conformité',
  digital_activity_spike: 'Digital',
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

function TriggerBadge({ type, label }: { type: string | null; label: string }) {
  const color = type ? (TRIGGER_BADGE_COLORS[type] || 'bg-neutral-50 text-neutral-600 border-neutral-200') : 'bg-neutral-50 text-neutral-600 border-neutral-200'
  return <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${color}`}>{label}</span>
}

function getLogoUrl(logoUrl: string | null | undefined, website: string | null | undefined): string | null {
  if (logoUrl && !logoUrl.includes('logo.clearbit.com')) return logoUrl
  if (website) {
    try {
      const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '')
      return `https://img.logo.dev/${domain}?token=pk_free&format=png`
    } catch {}
  }
  return null
}

function CompanyLogo({ src, website, name, size = 'md' }: { src?: string | null; website?: string | null; name: string; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false)
  const logoUrl = getLogoUrl(src, website)
  const dims = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9'

  if (!logoUrl || failed) {
    return (
      <div className={`${dims} rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <span className="text-[10px] font-bold text-blue-600">{name.slice(0, 2).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <img src={logoUrl} alt="" className={`${dims} rounded-lg object-contain bg-white border border-neutral-200 flex-shrink-0 mt-0.5`}
      onError={() => setFailed(true)} />
  )
}

// ── Composant principal ──────────────────────────────────────────────────────

export default function OpportunitiesClient() {
  const [activeTab, setActiveTab] = useState<'watches' | 'sector_search'>('watches')
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, hot: 0, warm: 0, new: 0 })
  const [loading, setLoading] = useState(true)
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineLog, setPipelineLog] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [heatFilter, setHeatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sortBy, setSortBy] = useState('total_score')

  // Load user watches for pipeline selector
  const [watches, setWatches] = useState<{ id: string; name: string }[]>([])
  const [selectedWatch, setSelectedWatch] = useState('')

  useEffect(() => {
    fetch('/api/opportunities/config')
      .then(r => r.json())
      .then(data => {
        if (data.watches) {
          setWatches(data.watches)
          if (data.watches.length > 0) setSelectedWatch(data.watches[0].id)
        }
      })
      .catch(() => {})
  }, [])

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

  async function handleRunPipeline() {
    if (!selectedWatch) return
    setPipelineRunning(true)
    setPipelineLog('Discovery en cours (Sonar + Firecrawl)...')
    setError('')
    try {
      const res = await fetch('/api/opportunities/run-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId: selectedWatch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const s = data.stats || {}
      setPipelineLog(
        `Pipeline terminé : ${s.sourcesDiscovered ?? 0} sources, ${s.pagesFetched ?? 0} pages, ` +
        `${s.signalsExtracted ?? 0} signaux, ${s.opportunitiesCreated ?? 0} opportunités créées, ` +
        `${s.opportunitiesUpdated ?? 0} MAJ, ${s.evidenceCreated ?? 0} preuves`
      )
      fetchOpps()
    } catch (e: any) {
      setError(e.message)
      setPipelineLog(null)
    } finally {
      setPipelineRunning(false)
    }
  }

  function handleStatusChange(oppId: string, newStatus: string) {
    setOpportunities(prev => prev.map(o => o.id === oppId ? { ...o, status: newStatus } : o))
  }

  return (
    <div className="pb-20 lg:pb-0">
      {/* Header + Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-base font-bold text-neutral-900">Opportunités commerciales</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Pipeline agents : discovery, extraction, qualification avec preuves</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-neutral-200">
        <button onClick={() => setActiveTab('watches')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'watches'
              ? 'border-blue-600 text-blue-700 bg-blue-50/50'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          }`}>
          <Eye size={14} /> Depuis mes veilles
        </button>
        <button onClick={() => setActiveTab('sector_search')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all -mb-px ${
            activeTab === 'sector_search'
              ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
              : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
          }`}>
          <Globe2 size={14} /> Recherche marché
        </button>
      </div>

      {/* ── Sector search tab ── */}
      {activeTab === 'sector_search' && (
        <SectorSearchPanel onSelectOpportunity={id => setSelectedId(id)} />
      )}

      {/* ── Watches tab ── */}
      {activeTab === 'watches' && <>

      {/* Pipeline launcher */}
      <div className="card mb-5 border-blue-200 bg-gradient-to-r from-blue-50/50 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <Radar size={16} className="text-blue-600" />
            <span className="font-semibold text-neutral-800">Pipeline Discovery</span>
            <span className="text-neutral-400">|</span>
            <span>Sonar + Firecrawl + Gemini</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {watches.length > 0 && (
              <select value={selectedWatch} onChange={e => setSelectedWatch(e.target.value)}
                className="input py-1.5 text-xs w-auto pr-8" disabled={pipelineRunning}>
                {watches.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <button onClick={handleRunPipeline} disabled={pipelineRunning || !selectedWatch}
              className="btn-primary flex items-center gap-1.5 text-xs">
              {pipelineRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {pipelineRunning ? 'Pipeline en cours...' : 'Lancer le pipeline'}
            </button>
          </div>
        </div>
        {pipelineLog && (
          <div className="mt-2 flex items-start gap-2 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
            <FileSearch size={12} className="mt-0.5 flex-shrink-0" />
            <span>{pipelineLog}</span>
            <button onClick={() => setPipelineLog(null)} className="ml-auto text-blue-400 hover:text-blue-600"><X size={12} /></button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Opportunités', value: stats.total, icon: Target, color: 'text-blue-600' },
          { label: 'Chaudes', value: stats.hot, icon: Flame, color: 'text-red-500' },
          { label: 'Tièdes', value: stats.warm, icon: TrendingUp, color: 'text-amber-500' },
          { label: 'Nouvelles', value: stats.new, icon: Zap, color: 'text-green-600' },
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

      {/* Filtres */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input className="input pl-9 py-2 text-xs" placeholder="Rechercher entreprise, signal..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
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
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} className="input py-1.5 text-xs w-auto pr-8">
            <option value="">Tous statuts</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input py-1.5 text-xs w-auto pr-8">
            <option value="total_score">Score</option>
            <option value="last_signal_at">Dernier signal</option>
            <option value="confidence_score">Confiance</option>
            <option value="created_at">Date détection</option>
          </select>
          <div className="flex border border-neutral-200 rounded-lg overflow-hidden">
            <button onClick={() => setView('table')} className={`p-1.5 ${view === 'table' ? 'bg-blue-700 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}>
              <LayoutList size={14} />
            </button>
            <button onClick={() => setView('cards')} className={`p-1.5 ${view === 'cards' ? 'bg-blue-700 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}>
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
          <AlertCircle size={14} /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-400">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-xs">Chargement des opportunités...</span>
        </div>
      )}

      {!loading && opportunities.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Target size={28} className="text-neutral-300" />
          </div>
          <p className="text-sm font-medium text-neutral-600 mb-1">Aucune opportunité détectée</p>
          <p className="text-xs text-neutral-400 mb-4 max-w-md mx-auto">
            Lancez le pipeline sur une de vos veilles pour découvrir des sources, extraire des signaux et qualifier des opportunités.
          </p>
          {watches.length > 0 && (
            <button onClick={handleRunPipeline} disabled={pipelineRunning} className="btn-primary text-xs">
              {pipelineRunning ? 'Pipeline en cours...' : 'Lancer le pipeline'}
            </button>
          )}
        </div>
      )}

      {/* ── Vue Table ── */}
      {!loading && opportunities.length > 0 && view === 'table' && (
        <div className="space-y-2">
          {opportunities.map(opp => {
            const heat = HEAT_CONFIG[opp.heat_level] || HEAT_CONFIG.cold
            const st = STATUS_LABELS[opp.status] || STATUS_LABELS.new
            const ev = EVIDENCE_CONFIG[opp.evidence_status] || EVIDENCE_CONFIG.weak
            const EvIcon = ev.icon
            return (
              <div key={opp.id}
                onClick={() => setSelectedId(opp.id)}
                className="card hover:shadow-md cursor-pointer transition-all group py-3 px-4">
                <div className="flex items-start gap-3">
                  <CompanyLogo src={opp.companies?.logo_url} website={opp.companies?.website} name={opp.companies?.name || opp.title || '?'} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-neutral-900 truncate group-hover:text-blue-700 transition-colors">{opp.companies?.name || opp.title?.split('—')[0]?.trim()}</span>
                      <span className="text-[10px] text-neutral-400 flex-shrink-0">{[opp.companies?.sector || opp.sector, opp.companies?.country || opp.country].filter(Boolean).join(' · ')}</span>
                      {opp.origin === 'sector_search' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium flex-shrink-0">Recherche</span>
                      )}
                    </div>

                    {opp.primary_trigger_label && (
                      <div className="text-xs font-semibold text-neutral-800 mb-0.5">{opp.primary_trigger_label}</div>
                    )}

                    {opp.primary_trigger_summary && (
                      <div className="text-[11px] text-neutral-500 line-clamp-1 mb-1">{opp.primary_trigger_summary}</div>
                    )}

                    {opp.business_hypothesis && (
                      <div className="text-[11px] text-neutral-500 italic line-clamp-1 mb-1.5">{opp.business_hypothesis}</div>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {opp.primary_trigger_type && (
                        <TriggerBadge type={opp.primary_trigger_type} label={
                          SIGNAL_BADGE_LABELS[opp.primary_trigger_type] || opp.primary_trigger_type
                        } />
                      )}
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${heat.bg}`}>
                        {heat.icon} {heat.label}
                      </span>
                      <span className="text-[10px] font-bold text-neutral-700">{opp.total_score}/100</span>
                      <span className={`inline-flex items-center gap-0.5 text-[10px] ${ev.color}`}>
                        <EvIcon size={10} /> {ev.label}
                      </span>
                      <span className={`badge text-[9px] ${st.color}`}>{st.label}</span>
                      {opp.evidence_count > 0 && (
                        <span className="text-[10px] text-neutral-400">{opp.evidence_count} preuve{opp.evidence_count > 1 ? 's' : ''}</span>
                      )}
                      <span className="text-[10px] text-neutral-400 flex items-center gap-0.5 ml-auto flex-shrink-0">
                        <Calendar size={10} /> {timeAgo(opp.last_signal_at)}
                      </span>
                    </div>
                  </div>

                  <ArrowUpRight size={14} className="text-neutral-300 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-1" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Vue Cards ── */}
      {!loading && opportunities.length > 0 && view === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {opportunities.map(opp => {
            const heat = HEAT_CONFIG[opp.heat_level] || HEAT_CONFIG.cold
            const st = STATUS_LABELS[opp.status] || STATUS_LABELS.new
            const ev = EVIDENCE_CONFIG[opp.evidence_status] || EVIDENCE_CONFIG.weak
            const EvIcon = ev.icon
            return (
              <div key={opp.id}
                onClick={() => setSelectedId(opp.id)}
                className="card hover:shadow-md cursor-pointer transition-all group">
                <div className="flex items-center gap-2 mb-2">
                  <CompanyLogo src={opp.companies?.logo_url} website={opp.companies?.website} name={opp.companies?.name || opp.title || '?'} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-neutral-900 truncate group-hover:text-blue-700">{opp.companies?.name || opp.title?.split('—')[0]?.trim()}</div>
                    <div className="text-[10px] text-neutral-400">{[opp.companies?.sector || opp.sector, opp.companies?.country || opp.country].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-bold text-neutral-900">{opp.total_score}</div>
                    <span className={`text-[10px] font-semibold ${heat.color}`}>{heat.icon} {heat.label}</span>
                  </div>
                </div>

                {opp.primary_trigger_label && (
                  <div className="text-xs font-semibold text-neutral-800 mb-0.5">{opp.primary_trigger_label}</div>
                )}
                {opp.primary_trigger_summary && (
                  <div className="text-[11px] text-neutral-500 line-clamp-2 mb-1">{opp.primary_trigger_summary}</div>
                )}
                {opp.business_hypothesis && (
                  <div className="text-[11px] text-neutral-500 italic line-clamp-2 mb-2">{opp.business_hypothesis}</div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {opp.primary_trigger_type && (
                      <TriggerBadge type={opp.primary_trigger_type} label={
                        SIGNAL_BADGE_LABELS[opp.primary_trigger_type] || opp.primary_trigger_type
                      } />
                    )}
                    <span className={`badge text-[9px] ${st.color}`}>{st.label}</span>
                    <span className={`inline-flex items-center gap-0.5 text-[10px] ${ev.color}`}>
                      <EvIcon size={10} />
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400 flex items-center gap-0.5">
                    <Calendar size={10} /> {timeAgo(opp.last_signal_at)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30">Précédent</button>
          <span className="text-xs text-neutral-500">Page {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30">Suivant</button>
        </div>
      )}

      </>}

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
