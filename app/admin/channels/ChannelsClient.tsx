'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check, ToggleLeft, ToggleRight, GripVertical } from 'lucide-react'

interface Channel {
  id: string
  slug: string
  name: string
  description: string | null
  name_fr: string | null
  name_en: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

const EMPTY: Omit<Channel, 'id' | 'created_at'> = {
  slug: '', name: '', description: '', name_fr: '', name_en: '', sort_order: 0, is_active: true,
}

export default function ChannelsClient({ initialChannels }: { initialChannels: Channel[] }) {
  const [channels, setChannels] = useState<Channel[]>(initialChannels)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startCreate() {
    setEditing(null)
    setCreating(true)
    setForm({ ...EMPTY, sort_order: channels.length })
    setError(null)
  }

  function startEdit(ch: Channel) {
    setCreating(false)
    setEditing(ch.id)
    setForm({
      slug: ch.slug, name: ch.name, description: ch.description ?? '',
      name_fr: ch.name_fr ?? '', name_en: ch.name_en ?? '',
      sort_order: ch.sort_order, is_active: ch.is_active,
    })
    setError(null)
  }

  function cancel() {
    setEditing(null)
    setCreating(false)
    setError(null)
  }

  async function save() {
    if (!form.name.trim() || !form.slug.trim()) {
      setError('Nom et slug requis.')
      return
    }
    setSaving(true)
    setError(null)

    try {
      if (creating) {
        const res = await fetch('/api/admin/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setChannels(prev => [...prev, data.channel])
        setCreating(false)
      } else if (editing) {
        const res = await fetch(`/api/admin/channels/${editing}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setChannels(prev => prev.map(c => c.id === editing ? data.channel : c))
        setEditing(null)
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(ch: Channel) {
    const res = await fetch(`/api/admin/channels/${ch.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !ch.is_active }),
    })
    const data = await res.json()
    if (res.ok) setChannels(prev => prev.map(c => c.id === ch.id ? data.channel : c))
  }

  async function remove(ch: Channel) {
    if (!confirm(`Supprimer la catégorie "${ch.name}" ? Cette action est irréversible.`)) return
    const res = await fetch(`/api/admin/channels/${ch.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      alert(data.error ?? 'Erreur')
      return
    }
    setChannels(prev => prev.filter(c => c.id !== ch.id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-800">Catégories Forecast</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Gérez les catégories thématiques. Les nouvelles catégories seront automatiquement couvertes par le générateur de questions IA.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors"
        >
          <Plus size={16} />
          Nouvelle catégorie
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-5 space-y-4">
          <h3 className="text-sm font-bold text-blue-800">Nouvelle catégorie</h3>
          <ChannelForm form={form} setForm={setForm} />
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors">
              <Check size={14} />{saving ? 'Création…' : 'Créer'}
            </button>
            <button onClick={cancel} className="px-4 py-2 rounded-lg border border-neutral-300 text-sm text-neutral-600 hover:bg-neutral-100 transition-colors">
              <X size={14} className="inline mr-1" />Annuler
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left w-8">#</th>
              <th className="px-4 py-3 text-left">Nom</th>
              <th className="px-4 py-3 text-left">Slug</th>
              <th className="px-4 py-3 text-left">FR</th>
              <th className="px-4 py-3 text-left">EN</th>
              <th className="px-4 py-3 text-center">Active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {channels.map(ch => (
              <tr key={ch.id} className={`${!ch.is_active ? 'opacity-50' : ''} hover:bg-neutral-50 transition-colors`}>
                {editing === ch.id ? (
                  <td colSpan={7} className="p-4">
                    <div className="space-y-4">
                      <ChannelForm form={form} setForm={setForm} />
                      <div className="flex gap-2">
                        <button onClick={save} disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50">
                          <Check size={12} />{saving ? 'Sauvegarde…' : 'Sauvegarder'}
                        </button>
                        <button onClick={cancel}
                          className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs text-neutral-600 hover:bg-neutral-100">
                          Annuler
                        </button>
                      </div>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-neutral-400">
                      <GripVertical size={14} className="inline" /> {ch.sort_order}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800">{ch.name}</td>
                    <td className="px-4 py-3 text-neutral-500 font-mono text-xs">{ch.slug}</td>
                    <td className="px-4 py-3 text-neutral-500">{ch.name_fr || '—'}</td>
                    <td className="px-4 py-3 text-neutral-500">{ch.name_en || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive(ch)} className="text-neutral-500 hover:text-neutral-800 transition-colors">
                        {ch.is_active
                          ? <ToggleRight size={22} className="text-emerald-500" />
                          : <ToggleLeft size={22} className="text-neutral-400" />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => startEdit(ch)}
                          className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-blue-600 transition-colors" title="Modifier">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => remove(ch)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-colors" title="Supprimer">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!channels.length && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">Aucune catégorie.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        <strong>Note :</strong> Les nouvelles catégories sont automatiquement prises en charge par le générateur de questions IA.
        Le système choisit en rotation les catégories ayant le moins de questions récentes pour assurer une couverture équitable.
      </div>
    </div>
  )
}

function ChannelForm({ form, setForm }: {
  form: Omit<Channel, 'id' | 'created_at'>
  setForm: (f: Omit<Channel, 'id' | 'created_at'>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Nom (interne)</label>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Macro & Commodities" />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Slug (URL)</label>
        <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="macro-commodities" />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Nom FR</label>
        <input value={form.name_fr ?? ''} onChange={e => setForm({ ...form, name_fr: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Macro & Matières premières" />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Nom EN</label>
        <input value={form.name_en ?? ''} onChange={e => setForm({ ...form, name_en: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Macro & Commodities" />
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-medium text-neutral-600 mb-1">Description</label>
        <textarea value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Description de la catégorie…" />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Ordre d&apos;affichage</label>
        <input type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
      </div>
      <div className="flex items-end pb-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })}
            className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm text-neutral-700">Active</span>
        </label>
      </div>
    </div>
  )
}
