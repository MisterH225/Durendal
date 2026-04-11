'use client'

import { useState } from 'react'
import { MapPin, Save, Plus, ToggleLeft, ToggleRight } from 'lucide-react'

interface Region {
  id: string
  region_code: string
  label_fr: string
  label_en: string
  weight: number
  is_active: boolean
  sort_order: number
}

const REGION_COLORS: Record<string, string> = {
  africa:        '#f59e0b',
  'middle-east': '#ef4444',
  asia:          '#8b5cf6',
  europe:        '#3b82f6',
  americas:      '#10b981',
  global:        '#6b7280',
}

export default function RegionsClient({ initialRegions }: { initialRegions: Region[] }) {
  const [regions, setRegions] = useState<Region[]>(initialRegions)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showAdd, setShowAdd] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newFr, setNewFr] = useState('')
  const [newEn, setNewEn] = useState('')

  const totalWeight = regions.filter(r => r.is_active).reduce((s, r) => s + r.weight, 0)

  function updateWeight(id: string, weight: number) {
    setRegions(prev => prev.map(r => r.id === id ? { ...r, weight: Math.max(0, Math.min(100, weight)) } : r))
    setSaved(false)
  }

  function toggleActive(id: string) {
    setRegions(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/regions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regions: regions.map(r => ({ id: r.id, weight: r.weight, is_active: r.is_active })),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Erreur')
        return
      }
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  async function addRegion() {
    if (!newCode || !newFr || !newEn) return
    setError(null)
    try {
      const res = await fetch('/api/admin/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region_code: newCode, label_fr: newFr, label_en: newEn, weight: 10 }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erreur'); return }
      setRegions(prev => [...prev, data.region])
      setNewCode(''); setNewFr(''); setNewEn(''); setShowAdd(false)
    } catch { setError('Erreur réseau') }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
            <MapPin size={20} />
            Régions & Pondération
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Ajustez le volume de collecte d&apos;information par région du monde.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Save size={14} />
          {saving ? 'Enregistrement…' : saved ? '✓ Enregistré' : 'Enregistrer'}
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

      {/* Distribution bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-neutral-700">Répartition cible</span>
          <span className={`font-bold tabular-nums ${Math.abs(totalWeight - 100) <= 5 ? 'text-emerald-600' : 'text-red-600'}`}>
            Total : {totalWeight}%
          </span>
        </div>
        <div className="flex h-6 rounded-full overflow-hidden bg-neutral-100">
          {regions.filter(r => r.is_active && r.weight > 0).map(r => {
            const color = REGION_COLORS[r.region_code] ?? '#9ca3af'
            const pct = totalWeight > 0 ? (r.weight / totalWeight) * 100 : 0
            return (
              <div
                key={r.id}
                className="h-full flex items-center justify-center text-[9px] font-bold text-white transition-all"
                style={{ width: `${pct}%`, backgroundColor: color, minWidth: pct > 0 ? '20px' : 0 }}
                title={`${r.label_fr}: ${r.weight}%`}
              >
                {pct >= 8 ? r.label_fr : ''}
              </div>
            )
          })}
        </div>
        {Math.abs(totalWeight - 100) > 5 && (
          <p className="text-xs text-red-500">Le total devrait être proche de 100%. Actuellement : {totalWeight}%</p>
        )}
      </div>

      {/* Region list */}
      <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
        {regions.map(r => {
          const color = REGION_COLORS[r.region_code] ?? '#9ca3af'
          return (
            <div key={r.id} className={`px-5 py-4 ${!r.is_active ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-neutral-800">{r.label_fr}</div>
                  <div className="text-[11px] text-neutral-400">{r.region_code} · {r.label_en}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateWeight(r.id, r.weight - 5)}
                    disabled={r.weight <= 0}
                    className="w-7 h-7 rounded-md border border-neutral-300 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={r.weight}
                    onChange={e => updateWeight(r.id, Number(e.target.value) || 0)}
                    className="w-14 h-8 text-center text-sm font-bold border border-neutral-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    style={{ color }}
                  />
                  <button
                    onClick={() => updateWeight(r.id, r.weight + 5)}
                    disabled={r.weight >= 100}
                    className="w-7 h-7 rounded-md border border-neutral-300 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold transition-colors"
                  >
                    +
                  </button>
                  <span className="text-sm text-neutral-400 w-4">%</span>
                  <button
                    onClick={() => toggleActive(r.id)}
                    className="ml-2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    title={r.is_active ? 'Désactiver' : 'Activer'}
                  >
                    {r.is_active ? <ToggleRight size={22} className="text-emerald-500" /> : <ToggleLeft size={22} />}
                  </button>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-2 ml-7">
                <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${r.weight}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add region */}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500 font-medium"
        >
          <Plus size={14} />
          Ajouter une région
        </button>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input
              placeholder="Code (ex: oceania)"
              value={newCode}
              onChange={e => setNewCode(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Nom FR (ex: Océanie)"
              value={newFr}
              onChange={e => setNewFr(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="Nom EN (ex: Oceania)"
              value={newEn}
              onChange={e => setNewEn(e.target.value)}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={addRegion} className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500">
              Créer
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
