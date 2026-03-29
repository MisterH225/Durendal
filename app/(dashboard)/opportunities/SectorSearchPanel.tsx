'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Loader2, Play, Globe2, Factory, Calendar, ArrowUpRight,
  AlertCircle, X, ChevronDown, Flame, TrendingUp, Target, Building2,
  ShieldCheck, Shield, ShieldAlert, FileSearch, Zap, Clock, MapPin,
} from 'lucide-react'

const SECTORS = [
  { key: 'BTP', label: 'BTP / Construction' },
  { key: 'Mines', label: 'Mines / Extraction' },
  { key: 'Agriculture', label: 'Agriculture / Agro-industrie' },
  { key: 'Industrie', label: 'Industrie / Manufacturing' },
  { key: 'Distribution', label: 'Distribution / Commerce' },
  { key: 'Énergie', label: 'Énergie' },
  { key: 'Santé', label: 'Santé / Pharma' },
  { key: 'Tech', label: 'Technologie / Digital' },
]

const COUNTRIES = [
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱' },
  { code: 'GN', name: 'Guinée', flag: '🇬🇳' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬' },
  { code: 'CD', name: 'RD Congo', flag: '🇨🇩' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'MA', name: 'Maroc', flag: '🇲🇦' },
  { code: 'TN', name: 'Tunisie', flag: '🇹🇳' },
  { code: 'DZ', name: 'Algérie', flag: '🇩🇿' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'TZ', name: 'Tanzanie', flag: '🇹🇿' },
  { code: 'ET', name: 'Éthiopie', flag: '🇪🇹' },
  { code: 'ZA', name: 'Afrique du Sud', flag: '🇿🇦' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'MU', name: 'Maurice', flag: '🇲🇺' },
]

const OPP_TYPES = [
  { key: 'tender_detected', label: 'Appels d\'offres' },
  { key: 'procurement_signal', label: 'Marchés publics' },
  { key: 'project_launch', label: 'Nouveaux projets' },
  { key: 'new_location', label: 'Nouveaux sites' },
  { key: 'expansion_plan', label: 'Extensions' },
  { key: 'hiring_spike', label: 'Recrutements' },
  { key: 'partnership', label: 'Partenariats' },
  { key: 'funding_event', label: 'Investissements' },
  { key: 'import_activity', label: 'Logistique / Achats' },
]

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
  partnership:       'bg-indigo-50 text-indigo-700 border-indigo-200',
  import_activity:   'bg-amber-50 text-amber-700 border-amber-200',
  funding_event:     'bg-green-50 text-green-700 border-green-200',
  new_location:      'bg-teal-50 text-teal-700 border-teal-200',
  procurement_signal:'bg-red-50 text-red-700 border-red-200',
}

const SIGNAL_BADGE_LABELS: Record<string, string> = {
  tender_detected: 'Appel d\'offres',
  project_launch: 'Projet',
  expansion_plan: 'Expansion',
  hiring_spike: 'Recrutement',
  partnership: 'Partenariat',
  import_activity: 'Logistique',
  funding_event: 'Investissement',
  new_location: 'Nouveau site',
  procurement_signal: 'Marché public',
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

interface SearchRecord {
  id: string
  sector: string
  sub_sector: string | null
  country: string
  status: string
  results_count: number
  stats: any
  created_at: string
  completed_at: string | null
}

interface SectorOpportunity {
  id: string
  title: string
  summary: string
  total_score: number
  confidence_score: number
  heat_level: string
  status: string
  primary_trigger_type: string | null
  primary_trigger_label: string | null
  primary_trigger_summary: string | null
  business_hypothesis: string | null
  evidence_count: number
  evidence_status: string
  display_status: string
  sector: string | null
  country: string | null
  origin: string
  last_signal_at: string | null
  companies: { id: string; name: string; sector: string | null; country: string | null } | null
}

interface Props {
  onSelectOpportunity: (id: string) => void
}

export default function SectorSearchPanel({ onSelectOpportunity }: Props) {
  // Form state
  const [sector, setSector] = useState('')
  const [country, setCountry] = useState('')
  const [subSector, setSubSector] = useState('')
  const [keywords, setKeywords] = useState('')
  const [oppTypes, setOppTypes] = useState<string[]>([])
  const [dateRange, setDateRange] = useState(30)

  // Search execution
  const [running, setRunning] = useState(false)
  const [runningSearchId, setRunningSearchId] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Past searches
  const [searches, setSearches] = useState<SearchRecord[]>([])
  const [loadingSearches, setLoadingSearches] = useState(true)

  // Results
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null)
  const [results, setResults] = useState<SectorOpportunity[]>([])
  const [loadingResults, setLoadingResults] = useState(false)

  const fetchSearches = useCallback(async () => {
    setLoadingSearches(true)
    try {
      const res = await fetch('/api/opportunity-searches')
      const data = await res.json()
      setSearches(data.searches || [])
    } catch {} finally { setLoadingSearches(false) }
  }, [])

  useEffect(() => { fetchSearches() }, [fetchSearches])

  const fetchResults = useCallback(async (searchId: string) => {
    setLoadingResults(true)
    setActiveSearchId(searchId)
    try {
      const res = await fetch(`/api/opportunities?origin=sector_search&searchId=${searchId}&limit=50&sort=total_score&dir=desc`)
      const data = await res.json()
      setResults(data.opportunities || [])
    } catch {} finally { setLoadingResults(false) }
  }, [])

  function toggleOppType(key: string) {
    setOppTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function handleSearch() {
    if (!sector || !country) return
    setRunning(true)
    setError('')
    setStatusMsg('Création de la recherche...')
    try {
      // Step 1: Create search
      const createRes = await fetch('/api/opportunity-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sector,
          country,
          subSector: subSector || undefined,
          keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
          opportunityTypes: oppTypes.length > 0 ? oppTypes : undefined,
          dateRangeDays: dateRange,
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error)

      const searchId = createData.search.id
      setRunningSearchId(searchId)
      setStatusMsg('Pipeline en cours : discovery, fetch, extraction, qualification...')

      // Step 2: Run pipeline
      const runRes = await fetch(`/api/opportunity-searches/${searchId}/run`, { method: 'POST' })
      const runData = await runRes.json()
      if (!runRes.ok) throw new Error(runData.error)

      const s = runData.result?.stats || {}
      setStatusMsg(
        `Terminé : ${s.sourcesDiscovered ?? 0} sources, ${s.pagesFetched ?? 0} pages, ` +
        `${s.signalsExtracted ?? 0} signaux, ${s.opportunitiesCreated ?? 0} opportunités`
      )

      fetchSearches()
      fetchResults(searchId)
    } catch (e: any) {
      setError(e.message)
      setStatusMsg(null)
    } finally {
      setRunning(false)
      setRunningSearchId(null)
    }
  }

  const sectorLabel = SECTORS.find(s => s.key === sector)?.label || sector
  const countryObj = COUNTRIES.find(c => c.code === country)

  return (
    <div className="space-y-5">
      {/* Search form */}
      <div className="card border-emerald-200 bg-gradient-to-r from-emerald-50/50 to-white">
        <div className="flex items-center gap-2 mb-4">
          <Globe2 size={16} className="text-emerald-600" />
          <span className="font-semibold text-sm text-neutral-800">Recherche d'opportunités sectorielles</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Sector */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Secteur *</label>
            <select value={sector} onChange={e => setSector(e.target.value)}
              className="input py-2 text-xs w-full" disabled={running}>
              <option value="">Choisir un secteur</option>
              {SECTORS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          {/* Country */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Pays *</label>
            <select value={country} onChange={e => setCountry(e.target.value)}
              className="input py-2 text-xs w-full" disabled={running}>
              <option value="">Choisir un pays</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
          </div>

          {/* Sub-sector */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Sous-secteur</label>
            <input value={subSector} onChange={e => setSubSector(e.target.value)}
              placeholder="Ex: Routes, Bâtiment..." className="input py-2 text-xs w-full" disabled={running} />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Mots-clés</label>
            <input value={keywords} onChange={e => setKeywords(e.target.value)}
              placeholder="Séparés par des virgules" className="input py-2 text-xs w-full" disabled={running} />
          </div>

          {/* Date range */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">Horizon temporel</label>
            <select value={dateRange} onChange={e => setDateRange(Number(e.target.value))}
              className="input py-2 text-xs w-full" disabled={running}>
              <option value={7}>7 derniers jours</option>
              <option value={30}>30 derniers jours</option>
              <option value={90}>90 derniers jours</option>
            </select>
          </div>

          {/* Launch */}
          <div className="flex items-end">
            <button onClick={handleSearch} disabled={running || !sector || !country}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2 text-xs">
              {running ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {running ? 'Pipeline en cours...' : 'Rechercher les opportunités'}
            </button>
          </div>
        </div>

        {/* Opportunity types filter */}
        <div className="mt-3">
          <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">Types d'opportunités à cibler</label>
          <div className="flex flex-wrap gap-1.5">
            {OPP_TYPES.map(t => (
              <button key={t.key} onClick={() => toggleOppType(t.key)} disabled={running}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${
                  oppTypes.includes(t.key)
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-neutral-600 border-neutral-200 hover:border-emerald-300'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div className="mt-3 flex items-start gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
            <FileSearch size={12} className="mt-0.5 flex-shrink-0" />
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-600"><X size={12} /></button>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700">
            <AlertCircle size={14} /> {error}
            <button onClick={() => setError('')} className="ml-auto"><X size={12} /></button>
          </div>
        )}
      </div>

      {/* Past searches */}
      {!loadingSearches && searches.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-neutral-700 mb-2 flex items-center gap-1.5">
            <Clock size={12} /> Recherches récentes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {searches.map(s => {
              const cObj = COUNTRIES.find(c => c.code === s.country)
              const sObj = SECTORS.find(sec => sec.key === s.sector)
              const isActive = activeSearchId === s.id
              return (
                <button key={s.id} onClick={() => fetchResults(s.id)}
                  className={`text-left card py-2.5 px-3 transition-all hover:shadow-sm ${
                    isActive ? 'border-emerald-400 bg-emerald-50/50' : ''
                  }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-neutral-800">{sObj?.label || s.sector}</span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${
                      s.status === 'completed' ? 'bg-green-100 text-green-700'
                      : s.status === 'running' ? 'bg-blue-100 text-blue-700'
                      : s.status === 'failed' ? 'bg-red-100 text-red-700'
                      : 'bg-neutral-100 text-neutral-600'
                    }`}>{
                      s.status === 'completed' ? 'Terminé'
                      : s.status === 'running' ? 'En cours'
                      : s.status === 'failed' ? 'Échoué'
                      : s.status === 'partial' ? 'Partiel'
                      : 'Brouillon'
                    }</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
                    <MapPin size={10} /> {cObj?.flag} {cObj?.name || s.country}
                    {s.results_count > 0 && (
                      <span className="ml-auto font-medium text-emerald-600">{s.results_count} opp.</span>
                    )}
                  </div>
                  <div className="text-[9px] text-neutral-400 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {activeSearchId && (
        <div>
          <h3 className="text-xs font-bold text-neutral-700 mb-3 flex items-center gap-1.5">
            <Target size={12} /> Opportunités détectées
            {results.length > 0 && <span className="text-neutral-400 font-normal">({results.length})</span>}
          </h3>

          {loadingResults && (
            <div className="flex items-center justify-center py-12 gap-2 text-neutral-400">
              <Loader2 size={18} className="animate-spin" /> <span className="text-xs">Chargement...</span>
            </div>
          )}

          {!loadingResults && results.length === 0 && (
            <div className="text-center py-10 text-neutral-400">
              <Target size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Aucune opportunité pour cette recherche</p>
            </div>
          )}

          {!loadingResults && results.length > 0 && (
            <div className="space-y-2">
              {results.map(opp => {
                const heat = HEAT_CONFIG[opp.heat_level] || HEAT_CONFIG.cold
                const ev = EVIDENCE_CONFIG[opp.evidence_status] || EVIDENCE_CONFIG.weak
                const EvIcon = ev.icon
                const displayName = opp.companies?.name || opp.title?.split('—')[0]?.trim() || 'Entité'
                return (
                  <div key={opp.id} onClick={() => onSelectOpportunity(opp.id)}
                    className="card hover:shadow-md cursor-pointer transition-all group py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-emerald-600">{displayName.slice(0, 2).toUpperCase()}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-neutral-900 truncate group-hover:text-emerald-700 transition-colors">
                            {displayName}
                          </span>
                          <span className="text-[10px] text-neutral-400 flex-shrink-0">
                            {[opp.sector, opp.country].filter(Boolean).join(' · ')}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 font-medium flex-shrink-0">
                            Recherche marché
                          </span>
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
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              TRIGGER_BADGE_COLORS[opp.primary_trigger_type] || 'bg-neutral-50 text-neutral-600 border-neutral-200'
                            }`}>
                              {SIGNAL_BADGE_LABELS[opp.primary_trigger_type] || opp.primary_trigger_type}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${heat.bg}`}>
                            {heat.icon} {heat.label}
                          </span>
                          <span className="text-[10px] font-bold text-neutral-700">{opp.total_score}/100</span>
                          <span className={`inline-flex items-center gap-0.5 text-[10px] ${ev.color}`}>
                            <EvIcon size={10} /> {ev.label}
                          </span>
                          {opp.evidence_count > 0 && (
                            <span className="text-[10px] text-neutral-400">{opp.evidence_count} preuve{opp.evidence_count > 1 ? 's' : ''}</span>
                          )}
                          <span className="text-[10px] text-neutral-400 flex items-center gap-0.5 ml-auto flex-shrink-0">
                            <Calendar size={10} /> {timeAgo(opp.last_signal_at)}
                          </span>
                        </div>
                      </div>

                      <ArrowUpRight size={14} className="text-neutral-300 group-hover:text-emerald-500 transition-colors flex-shrink-0 mt-1" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
