'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react'

const sectors = ['Fintech','E-commerce','Télécom','Logistique','BTP / Immobilier','Santé','EdTech','Énergie','Agriculture','Autre']
const countries = [
  { code: 'CI', name: 'Côte d\'Ivoire', flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲' },
  { code: 'MA', name: 'Maroc', flag: '🇲🇦' },
  { code: 'ZA', name: 'Afrique du Sud', flag: '🇿🇦' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
]

const suggestedCompanies: Record<string, { name: string; country: string; sector: string }[]> = {
  'Fintech': [
    { name: 'Wave Mobile Money', country: 'SN', sector: 'Fintech' },
    { name: 'MTN MoMo', country: 'GH', sector: 'Fintech' },
    { name: 'Orange Money', country: 'CI', sector: 'Fintech' },
    { name: 'Flutterwave', country: 'NG', sector: 'Fintech' },
    { name: 'PayDunya', country: 'CI', sector: 'Fintech' },
    { name: 'Ecobank Digital', country: 'CI', sector: 'Fintech' },
  ],
  'E-commerce': [
    { name: 'Jumia CI', country: 'CI', sector: 'E-commerce' },
    { name: 'Jiji CI', country: 'CI', sector: 'E-commerce' },
    { name: 'Afrimarket', country: 'CI', sector: 'E-commerce' },
  ],
  'Télécom': [
    { name: 'Orange CI', country: 'CI', sector: 'Télécom' },
    { name: 'MTN CI', country: 'CI', sector: 'Télécom' },
    { name: 'Moov Africa', country: 'CI', sector: 'Télécom' },
  ],
}

const steps = ['Informations', 'Secteurs & Pays', 'Entreprises', 'Configuration']

export default function NewWatchPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [companies, setCompanies] = useState<{ name: string; country: string; sector: string }[]>([])
  const [newCompanyName, setNewCompanyName] = useState('')
  const [frequency, setFrequency] = useState('daily')
  const [isShared, setIsShared] = useState(false)

  const suggestions = selectedSectors.flatMap(s => suggestedCompanies[s] || [])
    .filter(s => !companies.find(c => c.name === s.name))

  function toggleSector(s: string) {
    setSelectedSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  function toggleCountry(c: string) {
    setSelectedCountries(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }
  function addCompany(co: { name: string; country: string; sector: string }) {
    if (!companies.find(c => c.name === co.name)) setCompanies(prev => [...prev, co])
  }
  function removeCompany(name: string) {
    setCompanies(prev => prev.filter(c => c.name !== name))
  }
  function addCustomCompany() {
    if (!newCompanyName.trim()) return
    addCompany({ name: newCompanyName.trim(), country: selectedCountries[0] || 'CI', sector: selectedSectors[0] || 'Autre' })
    setNewCompanyName('')
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
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('account_id').eq('id', user!.id).single()

      // Create watch
      const { data: watch, error: watchError } = await supabase.from('watches').insert({
        account_id: profile?.account_id,
        created_by: user!.id,
        name,
        description,
        sectors: selectedSectors,
        countries: selectedCountries,
        frequency,
        is_shared: isShared,
      }).select().single()

      if (watchError) throw watchError

      // Upsert companies and link them
      for (const co of companies) {
        const { data: existingCo } = await supabase.from('companies')
          .select('id').eq('name', co.name).single()

        let companyId = existingCo?.id
        if (!companyId) {
          const { data: newCo } = await supabase.from('companies').insert({
            name: co.name, country: co.country, sector: co.sector, is_global: true
          }).select('id').single()
          companyId = newCo?.id
        }

        if (companyId) {
          await supabase.from('watch_companies').insert({ watch_id: watch.id, company_id: companyId })
        }
      }

      router.push('/veilles')
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la création')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      {/* Back */}
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
                <input className="input" placeholder="Ex: Veille Fintech Afrique de l'Ouest"
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
              <label className="label mb-2">Pays *</label>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-800 mb-3">
                Conseil : pour la fintech, CI + SN + GH concentrent 68% des levées de fonds régionales.
              </div>
              <div className="flex flex-wrap gap-2">
                {countries.map(({ code, name: cname, flag }) => (
                  <button key={code} onClick={() => toggleCountry(code)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                      ${selectedCountries.includes(code) ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'}`}>
                    <span>{flag}</span>{cname}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 — Entreprises */}
        {step === 2 && (
          <div>
            <h2 className="text-base font-bold text-neutral-900 mb-1">Entreprises à surveiller</h2>
            <p className="text-sm text-neutral-500 mb-4">Ajoutez les concurrents à suivre.</p>

            {/* Selected companies */}
            {companies.length > 0 && (
              <div className="mb-4 space-y-2">
                {companies.map(co => (
                  <div key={co.name} className="flex items-center gap-2.5 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold flex-shrink-0">
                      {co.name.slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 truncate">{co.name}</div>
                      <div className="text-[10px] text-neutral-500">{co.sector} · {co.country}</div>
                    </div>
                    <button onClick={() => removeCompany(co.name)} className="text-neutral-400 hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                  Suggestions — {selectedSectors.join(', ')}
                </div>
                <div className="space-y-1.5">
                  {suggestions.map(co => (
                    <button key={co.name} onClick={() => addCompany(co)}
                      className="w-full flex items-center gap-2.5 p-2.5 border border-neutral-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all text-left">
                      <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600 text-[10px] font-bold flex-shrink-0">
                        {co.name.slice(0,2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-neutral-900">{co.name}</div>
                        <div className="text-[10px] text-neutral-400">{co.sector} · {co.country}</div>
                      </div>
                      <span className="text-xs text-blue-700 font-medium flex-shrink-0">+ Ajouter</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add custom */}
            <div className="border-t border-neutral-100 pt-4">
              <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Ajouter manuellement</div>
              <div className="flex gap-2">
                <input className="input flex-1 text-sm" placeholder="Nom de l'entreprise..."
                  value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCustomCompany()} />
                <button onClick={addCustomCompany} className="btn-primary px-3 py-2 flex items-center gap-1">
                  <Plus size={14} />
                </button>
              </div>
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
                { label: 'Pays', value: selectedCountries.join(', ') },
                { label: 'Entreprises', value: `${companies.length} entreprise${companies.length > 1 ? 's' : ''}` },
                { label: 'Fréquence', value: frequency === 'realtime' ? 'Temps réel' : frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-neutral-500">{label}</span>
                  <span className="font-semibold text-neutral-900 text-right max-w-[60%]">{value}</span>
                </div>
              ))}
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
