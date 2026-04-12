'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Plus, X, Search, Loader2, Eye, Globe } from 'lucide-react'
import { ALL_COUNTRIES } from '@/lib/countries'

const sectors = ['Fintech','E-commerce','Télécom','Logistique','BTP / Immobilier','Santé','EdTech','Énergie','Agriculture','Mines','Banque / Assurance','Transport','Autre']

const SUGGESTED_ASPECTS = [
  'Importations','Exportations','Livraisons','Partenariats','Actions sociales / RSE',
  'Recrutement','Levées de fonds','Contrats publics','Expansion géographique',
  'Innovation / R&D','Résultats financiers','Appels d\'offres',
]

type CompanyEntry = { name: string; country: string; sector: string; website?: string; logo_url?: string; aspects: string[] }
type SearchResult = { name: string; domain: string; logo_url: string | null }

function resolveLogoUrl(src?: string | null, website?: string | null): string | null {
  if (src && !src.includes('logo.clearbit.com')) return src
  if (website) {
    try {
      const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname.replace(/^www\./, '')
      return `https://img.logo.dev/${domain}?token=pk_free&format=png`
    } catch {}
  }
  if (src) return src.replace('logo.clearbit.com', 'img.logo.dev').replace(/\?.*/, '?token=pk_free&format=png')
  return null
}

function CompanyLogo({ src, name, website, size = 'md' }: { src?: string | null; name: string; website?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const dims = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'
  const textSize = size === 'lg' ? 'text-xs' : 'text-[10px]'
  const logoUrl = resolveLogoUrl(src, website)
  if (!logoUrl || failed) {
    return (
      <div className={`${dims} rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0`}>
        <span className={`${textSize} font-bold text-blue-400`}>{name.slice(0, 2).toUpperCase()}</span>
      </div>
    )
  }
  return <img src={logoUrl} alt={name} className={`${dims} rounded-lg object-contain bg-neutral-800 border border-neutral-700 flex-shrink-0`} onError={() => setFailed(true)} />
}

const steps = ['Informations', 'Secteurs & Pays', 'Entreprises', 'Configuration']

export default function NewWatchPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [companies, setCompanies] = useState<CompanyEntry[]>([])
  const [frequency, setFrequency] = useState('daily')
  const [isShared, setIsShared] = useState(false)

  const [countrySearch, setCountrySearch] = useState('')
  const filteredCountries = countrySearch.trim().length > 0
    ? ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.toLowerCase().includes(countrySearch.toLowerCase()))
    : ALL_COUNTRIES

  const [newCompanyName, setNewCompanyName] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [editingAspectsFor, setEditingAspectsFor] = useState<string | null>(null)
  const [aspectInput, setAspectInput] = useState('')

  function toggleSector(s: string) { setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]) }
  function toggleCountry(code: string) { setSelectedCountries(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code]) }

  const searchCompanies = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setSearchResults(data.results ?? [])
      setShowResults(true)
    } catch { setSearchResults([]) }
    finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (newCompanyName.trim().length >= 2) searchCompanies(newCompanyName.trim())
      else { setSearchResults([]); setShowResults(false) }
    }, 400)
    return () => clearTimeout(timer)
  }, [newCompanyName, searchCompanies])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false) }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function addCompanyFromSearch(result: SearchResult) {
    if (companies.find(c => c.name === result.name)) return
    setCompanies(prev => [...prev, { name: result.name, country: selectedCountries[0] || '', sector: selectedSectors[0] || 'Autre', website: result.domain ? `https://${result.domain}` : undefined, logo_url: result.logo_url ?? undefined, aspects: [] }])
    setNewCompanyName(''); setShowResults(false)
  }
  function addCustomCompany() {
    if (!newCompanyName.trim() || companies.find(c => c.name === newCompanyName.trim())) return
    setCompanies(prev => [...prev, { name: newCompanyName.trim(), country: selectedCountries[0] || '', sector: selectedSectors[0] || 'Autre', aspects: [] }])
    setNewCompanyName(''); setShowResults(false)
  }
  function removeCompany(n: string) { setCompanies(prev => prev.filter(c => c.name !== n)); if (editingAspectsFor === n) setEditingAspectsFor(null) }
  function toggleAspect(cn: string, asp: string) {
    setCompanies(prev => prev.map(c => c.name !== cn ? c : { ...c, aspects: c.aspects.includes(asp) ? c.aspects.filter(a => a !== asp) : [...c.aspects, asp] }))
  }
  function addCustomAspect(cn: string) {
    const t = aspectInput.trim(); if (!t) return
    setCompanies(prev => prev.map(c => c.name !== cn || c.aspects.includes(t) ? c : { ...c, aspects: [...c.aspects, t] }))
    setAspectInput('')
  }
  function canProceed() {
    if (step === 0) return name.trim().length > 0
    if (step === 1) return selectedSectors.length > 0 && selectedCountries.length > 0
    if (step === 2) return companies.length > 0
    return true
  }

  async function handleCreate() {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/watches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, sectors: selectedSectors, countries: selectedCountries, companies: companies.map(c => ({ name: c.name, country: c.country, sector: c.sector, website: c.website, logo_url: c.logo_url, aspects: c.aspects })), frequency, is_shared: isShared }) })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `Erreur ${res.status}`)
      const watchId = data.watch?.id
      if (watchId) fetch('/api/agents/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ watchId }) }).catch(() => {})
      router.push('/forecast/veille/watches')
    } catch (err: any) { setError(err.message || 'Erreur'); setLoading(false) }
  }

  const countryLabel = (code: string) => ALL_COUNTRIES.find(c => c.code === code)
  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 outline-none'

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6">
      <button onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/forecast/veille/watches')}
        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 mb-5 transition-colors">
        <ArrowLeft size={14} /> {step > 0 ? 'Étape précédente' : 'Mes veilles'}
      </button>

      {/* Progress */}
      <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-shrink-0">
            <div className={`flex items-center gap-2 ${i <= step ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                i < step ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                i === step ? 'bg-blue-600 text-white' :
                'bg-neutral-800 text-neutral-600 border border-neutral-700'
              }`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-blue-400' : i < step ? 'text-emerald-400' : 'text-neutral-600'}`}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-8 h-px mx-2 ${i < step ? 'bg-emerald-500/30' : 'bg-neutral-800'}`} />}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 sm:p-6">
        {/* STEP 0 */}
        {step === 0 && (
          <div>
            <h2 className="text-base font-bold text-white mb-1">Nommez votre veille</h2>
            <p className="text-sm text-neutral-500 mb-5">Donnez un nom clair pour identifier cette veille.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Nom de la veille *</label>
                <input className={inputCls} placeholder="Ex: Veille Fintech Europe..." value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Description (optionnel)</label>
                <textarea className={`${inputCls} resize-none`} rows={3} placeholder="Décrivez l'objectif..." value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <h2 className="text-base font-bold text-white mb-1">Secteurs & marchés</h2>
            <p className="text-sm text-neutral-500 mb-5">Sélectionnez les secteurs et pays à surveiller.</p>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-neutral-300 mb-2">Secteurs *</label>
              <div className="flex flex-wrap gap-2">
                {sectors.map(s => (
                  <button key={s} onClick={() => toggleSector(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selectedSectors.includes(s) ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-600'}`}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-300 mb-2">Pays * ({selectedCountries.length})</label>
              {selectedCountries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedCountries.map(code => { const c = countryLabel(code); return (
                    <span key={code} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      {c?.flag} {c?.name ?? code}
                      <button onClick={() => toggleCountry(code)} className="ml-0.5 hover:text-blue-300"><X size={11} /></button>
                    </span>
                  )})}
                </div>
              )}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input className={`${inputCls} pl-9`} placeholder="Rechercher un pays..." value={countrySearch} onChange={e => setCountrySearch(e.target.value)} />
              </div>
              <div className="max-h-52 overflow-y-auto border border-neutral-700 rounded-lg p-2 bg-neutral-800/50">
                <div className="flex flex-wrap gap-1.5">
                  {filteredCountries.map(({ code, name: cname, flag }) => (
                    <button key={code} onClick={() => toggleCountry(code)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${selectedCountries.includes(code) ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-600'}`}>
                      <span>{flag}</span>{cname}
                    </button>
                  ))}
                  {filteredCountries.length === 0 && <p className="text-xs text-neutral-500 py-3 w-full text-center">Aucun pays trouvé</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <h2 className="text-base font-bold text-white mb-1">Entreprises à surveiller</h2>
            <p className="text-sm text-neutral-500 mb-4">Ajoutez les concurrents à suivre.</p>
            {companies.length > 0 && (
              <div className="mb-4 space-y-2">
                {companies.map(co => (
                  <div key={co.name} className="p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                    <div className="flex items-center gap-2.5">
                      <CompanyLogo src={co.logo_url} website={co.website} name={co.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-neutral-200 truncate">{co.name}</div>
                        <div className="text-[10px] text-neutral-500">{co.sector}{co.website && ` · ${co.website.replace('https://', '')}`}</div>
                      </div>
                      <button onClick={() => setEditingAspectsFor(editingAspectsFor === co.name ? null : co.name)} className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors">
                        <Eye size={11} /> Aspects{co.aspects.length > 0 && <span className="bg-blue-500/20 text-blue-400 rounded-full px-1.5 text-[9px]">{co.aspects.length}</span>}
                      </button>
                      <button onClick={() => removeCompany(co.name)} className="text-neutral-600 hover:text-red-400 transition-colors flex-shrink-0"><X size={14} /></button>
                    </div>
                    {editingAspectsFor === co.name && (
                      <div className="mt-2.5 pt-2.5 border-t border-emerald-500/20">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Aspects à surveiller</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {SUGGESTED_ASPECTS.map(asp => (
                            <button key={asp} onClick={() => toggleAspect(co.name, asp)} className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${co.aspects.includes(asp) ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-neutral-800 text-neutral-500 border-neutral-700 hover:border-neutral-600'}`}>{asp}</button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <input className={`${inputCls} text-[11px] flex-1 py-1`} placeholder="Aspect personnalisé..." value={aspectInput} onChange={e => setAspectInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addCustomAspect(co.name); e.preventDefault() }}} />
                          <button onClick={() => addCustomAspect(co.name)} className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-[10px] font-medium hover:bg-blue-500/20"><Plus size={10} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-neutral-800 pt-4" ref={searchRef}>
              <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider mb-2">Rechercher ou ajouter</div>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input className={`${inputCls} pl-9`} placeholder="Nom de l'entreprise..." value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCustomCompany() }} onFocus={() => { if (searchResults.length > 0) setShowResults(true) }} />
                    {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 animate-spin" />}
                  </div>
                  <button onClick={addCustomCompany} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-1"><Plus size={14} /></button>
                </div>
                {showResults && searchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-12 mt-1 bg-neutral-900 border border-neutral-700 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                    <div className="px-3 py-2 bg-neutral-800 border-b border-neutral-700 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">{searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}</div>
                    {searchResults.map((r, i) => (
                      <button key={i} onClick={() => addCompanyFromSearch(r)} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-800/70 transition-colors text-left border-b border-neutral-800 last:border-0 group">
                        <CompanyLogo src={r.logo_url} website={r.domain ? `https://${r.domain}` : undefined} name={r.name} size="lg" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-neutral-200 group-hover:text-white">{r.name}</div>
                          {r.domain && <div className="flex items-center gap-1 text-[11px] text-neutral-500 mt-0.5"><Globe size={10} />{r.domain}</div>}
                        </div>
                        <span className="text-[11px] text-blue-400 font-semibold flex-shrink-0 bg-blue-500/10 px-2 py-0.5 rounded-full">+ Ajouter</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            <h2 className="text-base font-bold text-white mb-1">Configuration finale</h2>
            <p className="text-sm text-neutral-500 mb-5">Fréquence et options.</p>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-neutral-300 mb-2">Fréquence de collecte</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'daily', label: 'Quotidienne', sub: '1 scan/jour', badge: 'Free' },
                  { val: 'realtime', label: 'Temps réel', sub: 'Dès qu\'un signal', badge: 'Pro' },
                  { val: 'weekly', label: 'Hebdomadaire', sub: 'Digest du lundi', badge: 'Free' },
                ].map(({ val, label, sub, badge }) => (
                  <button key={val} onClick={() => setFrequency(val)} className={`p-3 rounded-lg border text-left transition-all ${frequency === val ? 'border-blue-500/40 bg-blue-500/10' : 'border-neutral-700 hover:border-neutral-600 bg-neutral-800/50'}`}>
                    <div className="text-xs font-bold text-neutral-200 mb-0.5">{label}</div>
                    <div className="text-[10px] text-neutral-500 mb-1.5">{sub}</div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge === 'Pro' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-neutral-800 text-neutral-500 border-neutral-700'}`}>{badge}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-5 rounded-full transition-colors relative ${isShared ? 'bg-blue-600' : 'bg-neutral-700'}`} onClick={() => setIsShared(!isShared)}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow ${isShared ? 'left-5.5' : 'left-0.5'}`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-200">Veille partagée</div>
                  <div className="text-xs text-neutral-500">Visible par les membres (plan Business)</div>
                </div>
              </label>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-4 space-y-2 border border-neutral-700">
              <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-3">Récapitulatif</div>
              {[
                { label: 'Nom', value: name },
                { label: 'Secteurs', value: selectedSectors.join(', ') },
                { label: 'Pays', value: selectedCountries.map(c => countryLabel(c)?.name ?? c).join(', ') },
                { label: 'Entreprises', value: `${companies.length} entreprise${companies.length > 1 ? 's' : ''}` },
                { label: 'Fréquence', value: frequency === 'realtime' ? 'Temps réel' : frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-neutral-500">{label}</span>
                  <span className="font-semibold text-neutral-200 text-right max-w-[60%]">{value}</span>
                </div>
              ))}
            </div>
            {error && <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">{error}</div>}
          </div>
        )}

        {/* Nav */}
        <div className="flex justify-between mt-6 pt-4 border-t border-neutral-800">
          <button onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/forecast/veille/watches')} className="text-sm text-neutral-400 hover:text-white transition-colors">← Retour</button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed()} className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-40">Continuer <ArrowRight size={14} /></button>
          ) : (
            <button onClick={handleCreate} disabled={loading || !canProceed()} className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-40">{loading ? 'Création...' : <><Check size={14} /> Lancer la veille</>}</button>
          )}
        </div>
      </div>
    </div>
  )
}
