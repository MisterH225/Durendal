'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, X, Save, Trash2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const SECTORS = ['Fintech','E-commerce','Télécom','Logistique','BTP / Immobilier','Santé','EdTech','Énergie','Agriculture','Autre']
const COUNTRIES = [
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal',        flag: '🇸🇳' },
  { code: 'GH', name: 'Ghana',          flag: '🇬🇭' },
  { code: 'NG', name: 'Nigeria',        flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya',          flag: '🇰🇪' },
  { code: 'CM', name: 'Cameroun',       flag: '🇨🇲' },
  { code: 'MA', name: 'Maroc',          flag: '🇲🇦' },
  { code: 'ZA', name: 'Afrique du Sud', flag: '🇿🇦' },
  { code: 'BJ', name: 'Bénin',          flag: '🇧🇯' },
  { code: 'BF', name: 'Burkina Faso',   flag: '🇧🇫' },
  { code: 'ML', name: 'Mali',           flag: '🇲🇱' },
  { code: 'TG', name: 'Togo',           flag: '🇹🇬' },
]

type Company = { id?: string; name: string; country: string; sector: string }

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
  const [companies, setCompanies]     = useState<Company[]>(initialCompanies)
  const [newCompanyName, setNewCompanyName] = useState('')

  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError]             = useState('')

  function toggleSector(s: string) {
    setSectors(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  function toggleCountry(c: string) {
    setCountries(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }
  function removeCompany(name: string) {
    setCompanies(prev => prev.filter(c => c.name !== name))
  }
  function addCustomCompany() {
    const trimmed = newCompanyName.trim()
    if (!trimmed || companies.find(c => c.name === trimmed)) return
    setCompanies(prev => [...prev, { name: trimmed, country: countries[0] ?? 'CI', sector: sectors[0] ?? 'Autre' }])
    setNewCompanyName('')
  }

  async function handleSave() {
    if (!name.trim()) { setError('Le nom est obligatoire.'); return }
    setSaving(true)
    setError('')
    try {
      const { error: updateError } = await supabase.from('watches').update({
        name: name.trim(),
        description: description.trim() || null,
        sectors,
        countries,
        frequency,
        is_shared: isShared,
        is_active: isActive,
      }).eq('id', watch.id)

      if (updateError) throw updateError

      // Sync companies: delete all existing links, re-insert
      await supabase.from('watch_companies').delete().eq('watch_id', watch.id)

      for (const co of companies) {
        let companyId = co.id
        if (!companyId) {
          const { data: existing } = await supabase.from('companies').select('id').eq('name', co.name).single()
          if (existing) {
            companyId = existing.id
          } else {
            const { data: newCo } = await supabase.from('companies').insert({
              name: co.name, country: co.country, sector: co.sector, is_global: true,
            }).select('id').single()
            companyId = newCo?.id
          }
        }
        if (companyId) {
          await supabase.from('watch_companies').insert({ watch_id: watch.id, company_id: companyId })
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
      // Supprimer toutes les tables liées sans ON DELETE CASCADE
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

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/veilles" className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 mb-2 transition-colors">
            <ArrowLeft size={12} /> Mes veilles
          </Link>
          <h2 className="text-base font-bold text-neutral-900">Modifier la veille</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{watch.name}</p>
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 size={13} /> Supprimer
        </button>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-start gap-2 mb-3">
            <AlertCircle size={15} className="text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-red-800">Supprimer cette veille ?</div>
              <div className="text-xs text-red-600 mt-0.5">Cette action est irréversible. Tous les signaux et rapports associés seront supprimés.</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleDelete} disabled={deleting}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
              {deleting ? 'Suppression...' : 'Confirmer la suppression'}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 border border-neutral-200 text-xs font-medium text-neutral-600 rounded-lg hover:bg-neutral-50 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Informations */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Informations</h3>
          <div className="space-y-4">
            <div>
              <label className="label">Nom de la veille *</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Ex: Veille Fintech Afrique de l'Ouest" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input resize-none" rows={3} value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Décrivez l'objectif de cette veille..." />
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
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Pays</h3>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map(({ code, name: cname, flag }) => (
              <button key={code} onClick={() => toggleCountry(code)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                  ${countries.includes(code) ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-neutral-600 border-neutral-200 hover:border-blue-300'}`}>
                <span>{flag}</span>{cname}
              </button>
            ))}
          </div>
        </div>

        {/* Entreprises */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4">Entreprises surveillées</h3>

          {companies.length > 0 ? (
            <div className="space-y-2 mb-4">
              {companies.map(co => (
                <div key={co.name} className="flex items-center gap-2.5 p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700 text-[10px] font-bold flex-shrink-0">
                    {co.name.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-neutral-900 truncate">{co.name}</div>
                    <div className="text-[10px] text-neutral-500">{co.sector} · {co.country}</div>
                  </div>
                  <button onClick={() => removeCompany(co.name)}
                    className="text-neutral-400 hover:text-red-500 transition-colors p-1">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 mb-4">Aucune entreprise. Ajoutez-en au moins une.</p>
          )}

          <div className="flex gap-2">
            <input className="input flex-1 text-sm" placeholder="Ajouter une entreprise..."
              value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCustomCompany()} />
            <button onClick={addCustomCompany} className="btn-primary px-3 py-2 flex items-center gap-1">
              <Plus size={14} />
            </button>
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
          <Link href="/veilles" className="btn-ghost flex-1 text-center text-sm py-2.5">
            Annuler
          </Link>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-2.5 disabled:opacity-40">
            {saving ? 'Sauvegarde...' : <><Save size={14} /> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  )
}
