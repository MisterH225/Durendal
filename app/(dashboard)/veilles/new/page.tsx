'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Plus, X, Search, Loader2, Eye, Building2, Globe } from 'lucide-react'
import { ALL_COUNTRIES, type Country } from '@/lib/countries'

const sectors = ['Fintech','E-commerce','Télécom','Logistique','BTP / Immobilier','Santé','EdTech','Énergie','Agriculture','Mines','Banque / Assurance','Transport','Autre']

const SUGGESTED_ASPECTS = [
  'Importations','Exportations','Livraisons','Partenariats','Actions sociales / RSE',
  'Recrutement','Levées de fonds','Contrats publics','Expansion géographique',
  'Innovation / R&D','Résultats financiers','Appels d\'offres',
]

type CompanyEntry = {
  name:      string
  country:   string
  sector:    string
  website?:  string
  logo_url?: string
  aspects:   string[]
}

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
      <div className={`${dims} rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0`}>
        <span className={`${textSize} font-bold text-blue-600`}>{name.slice(0, 2).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      className={`${dims} rounded-lg object-contain bg-white border border-neutral-200 flex-shrink-0`}
      onError={() => setFailed(true)}
    />
  )
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

  // Country search
  const [countrySearch, setCountrySearch] = useState('')
  const filteredCountries = countrySearch.trim().length > 0
    ? ALL_COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.toLowerCase()))
    : ALL_COUNTRIES

  // Company search / disambiguation
  const [newCompanyName, setNewCompanyName] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Aspects editing
  const [editingAspectsFor, setEditingAspectsFor] = useState<string | null>(null)
  const [aspectInput, setAspectInput] = useState('')

  function toggleSector(s: string) {
    setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  function toggleCountry(code: string) {
    setSelectedCountries(prev => prev.includes(code) ? prev.filter(x => x !== code) : [...prev, code])
  }

  const searchCompanies = useCallback(async (query: string) => {
    if (query.length < 2) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setSearchResults(data.results ?? [])
      setShowResults(true)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (newCompanyName.trim().length >= 2) searchCompanies(newCompanyName.trim())
      else { setSearchResults([]); setShowResults(false) }
    }, 400)
    return () => clearTimeout(timer)
  }, [newCompanyName, searchCompanies])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function addCompanyFromSearch(result: SearchResult) {
    if (companies.find(c => c.name === result.name)) return
    setCompanies(prev => [...prev, {
      name:     result.name,
      country:  selectedCountries[0] || '',
      sector:   selectedSectors[0] || 'Autre',
      website:  result.domain ? `https://${result.domain}` : undefined,
      logo_url: result.logo_url ?? undefined,
      aspects:  [],
    }])
    setNewCompanyName('')
    setShowResults(false)
  }

  function addCustomCompany() {
    if (!newCompanyName.trim()) return
    if (companies.find(c => c.name === newCompanyName.trim())) return
    setCompanies(prev => [...prev, {
      name:    newCompanyName.trim(),
      country: selectedCountries[0] || '',
      sector:  selectedSectors[0] || 'Autre',
      aspects: [],
    }])
    setNewCompanyName('')
    setShowResults(false)
  }

  function removeCompany(companyName: string) {
    setCompanies(prev => prev.filter(c => c.name !== companyName))
    if (editingAspectsFor === companyName) setEditingAspectsFor(null)
  }

  function toggleAspect(companyName: string, aspect: string) {
    setCompanies(prev => prev.map(c => {
      if (c.name !== companyName) return c
      const has = c.aspects.includes(aspect)
      return { ...c, aspects: has ? c.aspects.filter(a => a !== aspect) : [...c.aspects, aspect] }
    }))
  }

  function addCustomAspect(companyName: string) {
    const trimmed = aspectInput.trim()
    if (!trimmed) return
    setCompanies(prev => prev.map(c => {
      if (c.name !== companyName || c.aspects.includes(trimmed)) return c
      return { ...c, aspects: [...c.aspects, trimmed] }
    }))
    setAspectInput('')
  }

  function canProceed() {
    if (step === 0) return name.trim().length > 0
    if (step === 1) return selectedSectors.length > 0 && selectedCountries.length > 0
    if (step === 2) return companies.length > 0
    return true
  }

  async function handleCreate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          sectors:   selectedSectors,
          countries: selectedCountries,
          companies: companies.map(c => ({
            name:     c.name,
            country:  c.country,
            sector:   c.sector,
            website:  c.website,
            logo_url: c.logo_url,
            aspects:  c.aspects,
          })),
          frequency,
          is_shared: isShared,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `Erreur ${res.status}`)

      const watchId = data.watch?.id
      if (watchId) {
        fetch('/api/agents/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ watchId }),
        }).catch(e => console.error('[AutoRun]', e))
      }
      router.push('/veilles')
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création')
      setLoading(false)
    }
  }

  const countryLabel = (code: string) => ALL_COUNTRIES.find(c => c.code === code)

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <button onClick={() => step > 0 ? setStep(s => s - 1) : router.back()}
        className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-5 transition-colors">
        <ArrowLeft size={14} /> {step > 0 ? 'Étape précédente' : 'Mes veilles'}
      </button>

      {/* Progress */}
      <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-shrink-0">
            <div className={`flex items-center gap-2 ${i <= step ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${i < step ? 'bg-green-600 text-white' : i === step ? 'bg-blue-700 text-white' : 'bg-neutral-200 text-neutral-500'}`}>
                {i < step ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-blue-700' : i < step ? 'text-green-600' : 'text-neutral-400'}`}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className={`w-8 h-px mx-2 ${i < step ? 'bg-green-400' : 'bg-neutral-200'}`} />}
          </div>
        ))}
      </div>

      <div className="card-lg">
        {/* STEP 0 — Informations */}
        {step === 0 && (
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-1">Nommez votre veille</h2>
            <p className="text-sm text-neutral-500 mb-5">Donnez un nom clair pour identifier cette veille.</p>
            <div className="space-y-4">
              <div>
                <label className="label">Nom de la veille *</label>
                <input className="input" placeholder="Ex: Veille Fintech Europe, Veille BTP Afrique de l'Ouest..."
                  value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">Description (optionnel)</label>
                <textarea className="input resize-none" rows={3}
                  placeholder="Décrivez l'objectif de cette veille..."
                  value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* STEP 1 — Secteurs & Pays */}
        {step === 1 && (
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-1">Secteurs & marchés</h2>
            <p className="text-sm text-neutral-500 mb-5">Sélectionnez les secteurs et pays à surveiller.</p>

            <div className="mb-5">
              <label className="label mb-2">Secteurs *</label>
              <div className="flex flex-wrap gap-2">
                {sectors.map(s => (
                  <button key={s} onClick={() => toggleSector(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                      ${selectedSectors.includes(s) ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label mb-2">Pays * ({selectedCountries.length} sélectionné{selectedCountries.length > 1 ? 's' : ''})</label>

              {/* Selected countries chips */}
              {selectedCountries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {selectedCountries.map(code => {
                    const c = countryLabel(code)
                    return (
                      <span key={code} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-700 text-white">
                        {c?.flag} {c?.name ?? code}
                        <button onClick={() => toggleCountry(code)} className="ml-0.5 hover:text-blue-200">
                          <X size={11} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Search input */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  className="input pl-9"
                  placeholder="Rechercher un pays..."
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                />
              </div>

              {/* Countries grid */}
              <div className="max-h-52 overflow-y-auto border border-neutral-200 rounded-lg p-2">
                <div className="flex flex-wrap gap-1.5">
                  {filteredCountries.map(({ code, name: cname, flag }) => (
                    <button key={code} onClick={() => toggleCountry(code)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                        ${selectedCountries.includes(code)
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'}`}>
                      <span>{flag}</span>{cname}
                    </button>
                  ))}
                  {filteredCountries.length === 0 && (
                    <p className="text-xs text-neutral-400 py-3 w-full text-center">Aucun pays trouvé pour &quot;{countrySearch}&quot;</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 — Entreprises */}
        {step === 2 && (
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-1">Entreprises à surveiller</h2>
            <p className="text-sm text-neutral-500 mb-4">Ajoutez les concurrents à suivre. Vous pouvez optionnellement préciser des aspects à surveiller pour chaque entreprise.</p>

            {/* Selected companies */}
            {companies.length > 0 && (
              <div className="mb-4 space-y-2">
                {companies.map(co => (
                  <div key={co.name} className="p-2.5 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2.5">
                      <CompanyLogo src={co.logo_url} website={co.website} name={co.name} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-neutral-900 truncate">{co.name}</div>
                        <div className="text-[10px] text-neutral-500">
                          {co.sector}{co.website && ` · ${co.website.replace('https://', '')}`}
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingAspectsFor(editingAspectsFor === co.name ? null : co.name)}
                        className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                      >
                        <Eye size={11} /> Aspects
                        {co.aspects.length > 0 && <span className="bg-blue-600 text-white rounded-full px-1.5 text-[9px]">{co.aspects.length}</span>}
                      </button>
                      <button onClick={() => removeCompany(co.name)} className="text-neutral-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <X size={14} />
                      </button>
                    </div>

                    {/* Aspects panel */}
                    {editingAspectsFor === co.name && (
                      <div className="mt-2.5 pt-2.5 border-t border-green-200">
                        <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Aspects à surveiller (optionnel)</div>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {SUGGESTED_ASPECTS.map(asp => (
                            <button key={asp} onClick={() => toggleAspect(co.name, asp)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                                co.aspects.includes(asp)
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'
                              }`}>
                              {asp}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <input className="input text-[11px] flex-1 py-1" placeholder="Aspect personnalisé..."
                            value={aspectInput} onChange={e => setAspectInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { addCustomAspect(co.name); e.preventDefault() } }} />
                          <button onClick={() => addCustomAspect(co.name)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[10px] font-medium hover:bg-blue-200">
                            <Plus size={10} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Company search + add */}
            <div className="border-t border-neutral-100 pt-4" ref={searchRef}>
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Rechercher ou ajouter une entreprise</div>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      className="input pl-9 text-sm"
                      placeholder="Nom de l'entreprise..."
                      value={newCompanyName}
                      onChange={e => setNewCompanyName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCustomCompany() }}
                      onFocus={() => { if (searchResults.length > 0) setShowResults(true) }}
                    />
                    {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 animate-spin" />}
                  </div>
                  <button onClick={addCustomCompany} className="btn-primary px-3 py-2 flex items-center gap-1" title="Ajouter manuellement">
                    <Plus size={14} />
                  </button>
                </div>

                {/* Search results dropdown */}
                {showResults && searchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-12 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                    <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-100 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                      {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''} — cliquez pour sélectionner
                    </div>
                    {searchResults.map((r, i) => (
                      <button key={i} onClick={() => addCompanyFromSearch(r)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-neutral-100 last:border-0 group">
                        <CompanyLogo src={r.logo_url} website={r.domain ? `https://${r.domain}` : undefined} name={r.name} size="lg" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-neutral-900 group-hover:text-blue-700 transition-colors">{r.name}</div>
                          {r.domain && (
                            <div className="flex items-center gap-1 text-[11px] text-neutral-400 mt-0.5">
                              <Globe size={10} className="flex-shrink-0" />
                              {r.domain}
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] text-blue-700 font-semibold flex-shrink-0 bg-blue-50 px-2 py-0.5 rounded-full group-hover:bg-blue-100 transition-colors">+ Ajouter</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-neutral-400 mt-1.5">
                Tapez un nom pour rechercher l&apos;entreprise avec son logo. Appuyez sur <kbd className="bg-neutral-100 px-1 rounded">+</kbd> pour ajouter manuellement.
              </p>
            </div>
          </div>
        )}

        {/* STEP 3 — Configuration */}
        {step === 3 && (
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-1">Configuration finale</h2>
            <p className="text-sm text-neutral-500 mb-5">Définissez la fréquence et les options de votre veille.</p>

            <div className="mb-5">
              <label className="label mb-2">Fréquence de collecte</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { val: 'daily', label: 'Quotidienne', sub: '1 scan/jour', badge: 'Free' },
                  { val: 'realtime', label: 'Temps réel', sub: 'Dès qu\'un signal paraît', badge: 'Pro' },
                  { val: 'weekly', label: 'Hebdomadaire', sub: 'Digest du lundi', badge: 'Free' },
                ].map(({ val, label, sub, badge }) => (
                  <button key={val} onClick={() => setFrequency(val)}
                    className={`p-3 rounded-lg border text-left transition-all ${frequency === val ? 'border-blue-700 bg-blue-50' : 'border-neutral-200 hover:border-blue-200'}`}>
                    <div className="text-xs font-bold text-neutral-900 mb-0.5">{label}</div>
                    <div className="text-[10px] text-neutral-500 mb-1.5">{sub}</div>
                    <span className={`badge text-[10px] ${badge === 'Pro' ? 'badge-blue' : 'badge-gray'}`}>{badge}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-5 rounded-full transition-colors relative ${isShared ? 'bg-blue-700' : 'bg-neutral-300'}`}
                  onClick={() => setIsShared(!isShared)}>
                  <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow ${isShared ? 'left-5.5' : 'left-0.5'}`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">Veille partagée</div>
                  <div className="text-xs text-neutral-500">Visible par tous les membres de votre équipe (plan Business)</div>
                </div>
              </label>
            </div>

            {/* Summary */}
            <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
              <div className="text-xs font-bold text-neutral-600 uppercase tracking-wider mb-3">Récapitulatif</div>
              {[
                { label: 'Nom', value: name },
                { label: 'Secteurs', value: selectedSectors.join(', ') },
                { label: 'Pays', value: selectedCountries.map(c => countryLabel(c)?.name ?? c).join(', ') },
                { label: 'Entreprises', value: `${companies.length} entreprise${companies.length > 1 ? 's' : ''}` },
                { label: 'Fréquence', value: frequency === 'realtime' ? 'Temps réel' : frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-neutral-500">{label}</span>
                  <span className="font-semibold text-neutral-900 text-right max-w-[60%]">{value}</span>
                </div>
              ))}
              {companies.some(c => c.aspects.length > 0) && (
                <div className="pt-2 border-t border-neutral-200 mt-2">
                  <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1">Aspects surveillés</div>
                  {companies.filter(c => c.aspects.length > 0).map(c => (
                    <div key={c.name} className="text-[11px] text-neutral-600 mb-0.5">
                      <span className="font-semibold">{c.name}</span> : {c.aspects.join(', ')}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6 pt-4 border-t border-neutral-100">
          <button onClick={() => step > 0 ? setStep(s => s - 1) : router.back()}
            className="btn-ghost text-sm">
            ← Retour
          </button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canProceed()}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
              Continuer <ArrowRight size={14} />
            </button>
          ) : (
            <button onClick={handleCreate} disabled={loading || !canProceed()}
              className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40">
              {loading ? 'Création...' : <><Check size={14} /> Lancer la veille</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
