'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, X, Save, Trash2, AlertCircle, Search, Loader2, Eye, Building2, Globe } from 'lucide-react'
import Link from 'next/link'
import { ALL_COUNTRIES } from '@/lib/countries'

const SECTORS = ['Fintech','E-commerce','Télécom','Logistique','BTP / Immobilier','Santé','EdTech','Énergie','Agriculture','Mines','Banque / Assurance','Transport','Autre']

const SUGGESTED_ASPECTS = [
  'Importations','Exportations','Livraisons','Partenariats','Actions sociales / RSE',
  'Recrutement','Levées de fonds','Contrats publics','Expansion géographique',
  'Innovation / R&D','Résultats financiers','Appels d\'offres',
]

type Company = { id?: string; name: string; country: string; sector: string; website?: string; logo_url?: string; aspects?: string[] }
type SearchResult = { name: string; domain: string; logo_url: string | null }

function CompanyLogo({ src, name, size = 'md' }: { src?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false)
  const dims = size === 'sm' ? 'w-7 h-7' : size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'
  const textSize = size === 'lg' ? 'text-xs' : 'text-[10px]'

  if (!src || failed) {
    return (
      <div className={`${dims} rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0`}>
        <span className={`${textSize} font-bold text-blue-600`}>{name.slice(0, 2).toUpperCase()}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      className={`${dims} rounded-lg object-contain bg-white border border-neutral-200 flex-shrink-0`}
      onError={() => setFailed(true)}
    />
  )
}

interface Props {
  watch: {
    id: string
    name: string
    description: string | null
    sectors: string[] | null
    countries: string[] | null
    frequency: string
    is_shared: boolean
    is_active: boolean
  }
  initialCompanies: Company[]
}

export default function EditWatchContent({ watch, initialCompanies }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName]               = useState(watch.name)
  const [description, setDescription] = useState(watch.description ?? '')
  const [sectors, setSectors]         = useState<string[]>(watch.sectors ?? [])
  const [countries, setCountries]     = useState<string[]>(watch.countries ?? [])
  const [frequency, setFrequency]     = useState(watch.frequency ?? 'daily')
  const [isShared, setIsShared]       = useState(watch.is_shared ?? false)
  const [isActive, setIsActive]       = useState(watch.is_active ?? true)
  const [companies, setCompanies]     = useState<Company[]>(initialCompanies.map(c => ({ ...c, aspects: c.aspects ?? [] })))

  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError]             = useState('')

  // Country search
  const [countrySearch, setCountrySearch] = useState('')
  const filteredCountries = countrySearch.trim()
    ? ALL_COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.toLowerCase()))
    : ALL_COUNTRIES

  // Company search
  const [newCompanyName, setNewCompanyName] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Aspects
  const [editingAspectsFor, setEditingAspectsFor] = useState<string | null>(null)
  const [aspectInput, setAspectInput] = useState('')

  function toggleSector(s: string) {
    setSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  function toggleCountry(c: string) {
    setCountries(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }
  function removeCompany(companyName: string) {
    setCompanies(prev => prev.filter(c => c.name !== companyName))
    if (editingAspectsFor === companyName) setEditingAspectsFor(null)
  }

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
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function addCompanyFromSearch(result: SearchResult) {
    if (companies.find(c => c.name === result.name)) return
    setCompanies(prev => [...prev, {
      name: result.name, country: countries[0] ?? '', sector: sectors[0] ?? 'Autre',
      website: result.domain ? `https://${result.domain}` : undefined,
      logo_url: result.logo_url ?? undefined, aspects: [],
    }])
    setNewCompanyName(''); setShowResults(false)
  }

  function addCustomCompany() {
    const trimmed = newCompanyName.trim()
    if (!trimmed || companies.find(c => c.name === trimmed)) return
    setCompanies(prev => [...prev, { name: trimmed, country: countries[0] ?? '', sector: sectors[0] ?? 'Autre', aspects: [] }])
    setNewCompanyName(''); setShowResults(false)
  }

  function toggleAspect(companyName: string, aspect: string) {
    setCompanies(prev => prev.map(c => {
      if (c.name !== companyName) return c
      const has = (c.aspects ?? []).includes(aspect)
      return { ...c, aspects: has ? (c.aspects ?? []).filter(a => a !== aspect) : [...(c.aspects ?? []), aspect] }
    }))
  }

  function addCustomAspect(companyName: string) {
    const trimmed = aspectInput.trim()
    if (!trimmed) return
    setCompanies(prev => prev.map(c => {
      if (c.name !== companyName || (c.aspects ?? []).includes(trimmed)) return c
      return { ...c, aspects: [...(c.aspects ?? []), trimmed] }
    }))
    setAspectInput('')
  }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est obligatoire.'); return }
    setSaving(true)
    setError('')
    try {
      const { error: updateError } = await supabase.from('watches').update({
        name: name.trim(), description: description.trim() || null,
        sectors, countries, frequency, is_shared: isShared, is_active: isActive,
      }).eq('id', watch.id)
      if (updateError) throw updateError

      await supabase.from('watch_companies').delete().eq('watch_id', watch.id)

      for (const co of companies) {
        let companyId = co.id
        if (!companyId) {
          const { data: existing } = await supabase.from('companies').select('id').eq('name', co.name).single()
          if (existing) { companyId = existing.id } else {
            const { data: newCo } = await supabase.from('companies').insert({
              name: co.name, country: co.country, sector: co.sector,
              is_global: true, logo_url: co.logo_url ?? null,
            }).select('id').single()
            companyId = newCo?.id
          }
        }
        if (companyId) {
          await supabase.from('watch_companies').insert({
            watch_id: watch.id, company_id: companyId, aspects: co.aspects ?? [],
          })
        }
      }

      router.push('/veilles')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la sauvegarde.')
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    try {
      await supabase.from('alerts').delete().eq('watch_id', watch.id)
      await supabase.from('chat_messages').update({ watch_id: null }).eq('watch_id', watch.id)
      await supabase.from('watch_companies').delete().eq('watch_id', watch.id)
      const { error: delError } = await supabase.from('watches').delete().eq('id', watch.id)
      if (delError) throw delError
      router.push('/veilles')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression.')
      setDeleting(false)
    }
  }

  const countryLabel = (code: string) => ALL_COUNTRIES.find(c => c.code === code)

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/veilles" className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 mb-2 transition-colors">
            <ArrowLeft size={12} /> Mes veilles
          </Link>
          <h2 className="text-base font-bold text-neutral-900">Modifier la veille</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{watch.name}</p>
        </div>
        <button onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors">
          <Trash2 size={13} /> Supprimer
        </button>
      </div>

      {confirmDelete && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-800">Supprimer cette veille ?</div>
              <div className="text-xs text-red-600 mt-0.5">Cette action est irréversible.</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={deleting}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50">
              {deleting ? 'Suppression...' : 'Confirmer'}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 border border-neutral-200 text-xs font-medium text-neutral-600 rounded-lg hover:bg-neutral-50">
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Informations */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Informations</h3>
          <div className="space-y-4">
            <div>
              <label className="label">Nom de la veille *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Veille Fintech Europe" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Décrivez l'objectif de cette veille..." />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-neutral-900">Statut</div>
                <div className="text-xs text-neutral-500">{isActive ? 'La veille est active' : 'La veille est en pause'}</div>
              </div>
              <button onClick={() => setIsActive(!isActive)}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${isActive ? 'bg-blue-700' : 'bg-neutral-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow ${isActive ? 'left-5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Secteurs */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Secteurs</h3>
          <div className="flex flex-wrap gap-2">
            {SECTORS.map(s => (
              <button key={s} onClick={() => toggleSector(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                  ${sectors.includes(s) ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Pays */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Pays ({countries.length} sélectionné{countries.length > 1 ? 's' : ''})</h3>
          {countries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {countries.map(code => {
                const c = countryLabel(code)
                return (
                  <span key={code} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-700 text-white">
                    {c?.flag} {c?.name ?? code}
                    <button onClick={() => toggleCountry(code)} className="ml-0.5 hover:text-blue-200"><X size={11} /></button>
                  </span>
                )
              })}
            </div>
          )}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input className="input pl-9" placeholder="Rechercher un pays..." value={countrySearch} onChange={e => setCountrySearch(e.target.value)} />
          </div>
          <div className="max-h-44 overflow-y-auto border border-neutral-200 rounded-lg p-2">
            <div className="flex flex-wrap gap-1.5">
              {filteredCountries.map(({ code, name: cname, flag }) => (
                <button key={code} onClick={() => toggleCountry(code)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all
                    ${countries.includes(code) ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'}`}>
                  <span>{flag}</span>{cname}
                </button>
              ))}
              {filteredCountries.length === 0 && (
                <p className="text-xs text-neutral-400 py-3 w-full text-center">Aucun pays trouvé</p>
              )}
            </div>
          </div>
        </div>

        {/* Entreprises */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Entreprises surveillées</h3>
          {companies.length > 0 ? (
            <div className="space-y-2 mb-4">
              {companies.map(co => (
                <div key={co.name} className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <CompanyLogo src={co.logo_url} name={co.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 truncate">{co.name}</div>
                      <div className="text-[10px] text-neutral-500">{co.sector} · {co.country}</div>
                    </div>
                    <button onClick={() => setEditingAspectsFor(editingAspectsFor === co.name ? null : co.name)}
                      className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded hover:bg-blue-50">
                      <Eye size={11} /> Aspects
                      {(co.aspects ?? []).length > 0 && <span className="bg-blue-600 text-white rounded-full px-1.5 text-[9px]">{(co.aspects ?? []).length}</span>}
                    </button>
                    <button onClick={() => removeCompany(co.name)} className="text-neutral-400 hover:text-red-500 transition-colors p-1"><X size={13} /></button>
                  </div>
                  {editingAspectsFor === co.name && (
                    <div className="mt-2.5 pt-2.5 border-t border-neutral-200">
                      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Aspects à surveiller (optionnel)</div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {SUGGESTED_ASPECTS.map(asp => (
                          <button key={asp} onClick={() => toggleAspect(co.name, asp)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                              (co.aspects ?? []).includes(asp) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'
                            }`}>{asp}</button>
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
          ) : (
            <p className="text-xs text-neutral-400 mb-4">Aucune entreprise. Ajoutez-en au moins une.</p>
          )}

          <div ref={searchRef} className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input className="input pl-9 text-sm" placeholder="Rechercher une entreprise..."
                  value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCustomCompany() }}
                  onFocus={() => { if (searchResults.length > 0) setShowResults(true) }} />
                {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 animate-spin" />}
              </div>
              <button onClick={addCustomCompany} className="btn-primary px-3 py-2 flex items-center gap-1"><Plus size={14} /></button>
            </div>
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-20 left-0 right-12 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-100 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                  {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
                </div>
                {searchResults.map((r, i) => (
                  <button key={i} onClick={() => addCompanyFromSearch(r)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-neutral-100 last:border-0 group">
                    <CompanyLogo src={r.logo_url} name={r.name} size="lg" />
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
        </div>

        {/* Configuration */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Configuration</h3>
          <div className="mb-5">
            <label className="label mb-2">Fréquence de collecte</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 'daily',    label: 'Quotidienne', sub: '1 scan / jour',          badge: 'Free' },
                { val: 'realtime', label: 'Temps réel',  sub: "Dès qu'un signal paraît", badge: 'Pro'  },
                { val: 'weekly',   label: 'Hebdomadaire', sub: 'Digest du lundi',         badge: 'Free' },
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
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <button onClick={() => setIsShared(!isShared)}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${isShared ? 'bg-blue-700' : 'bg-neutral-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow ${isShared ? 'left-5' : 'left-0.5'}`} />
              </button>
              <div>
                <div className="text-sm font-medium text-neutral-900">Veille partagée</div>
                <div className="text-xs text-neutral-500">Visible par tous les membres de l&apos;équipe (plan Business)</div>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link href="/veilles" className="btn-ghost flex-1 text-center text-sm py-2.5">Annuler</Link>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-2.5 disabled:opacity-40">
            {saving ? 'Sauvegarde...' : <><Save size={14} /> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  )
}
