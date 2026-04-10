'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Channel { id: string; slug: string; name: string }
interface Props { channels: Channel[] }

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function NewEventForm({ channels }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    channel_id:  channels[0]?.id ?? '',
    slug:        '',
    title:       '',
    description: '',
    status:      'draft',
    starts_at:   '',
    ends_at:     '',
    tags:        '',
  })

  function set(k: keyof typeof form, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function handleTitleChange(v: string) {
    set('title', v)
    if (!form.slug || form.slug === slugify(form.title)) set('slug', slugify(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/forecast/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id:  form.channel_id,
          slug:        form.slug,
          title:       form.title,
          description: form.description || null,
          status:      form.status,
          starts_at:   form.starts_at ? new Date(form.starts_at).toISOString() : null,
          ends_at:     form.ends_at   ? new Date(form.ends_at).toISOString()   : null,
          tags:        form.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return }
      router.push('/admin/forecast')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-neutral-400'
  const labelCls = 'block text-xs font-semibold text-neutral-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className={labelCls}>Channel *</label>
        <select value={form.channel_id} onChange={e => set('channel_id', e.target.value)} className={inputCls} required>
          {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>Titre *</label>
        <input
          type="text"
          value={form.title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="Ex : Réunion BCE Mars 2026"
          className={inputCls}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Slug (URL) *</label>
        <input
          type="text"
          value={form.slug}
          onChange={e => set('slug', e.target.value)}
          placeholder="reunion-bce-mars-2026"
          className={inputCls}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
          placeholder="Contexte de l'événement…"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Date de début</label>
          <input type="datetime-local" value={form.starts_at} onChange={e => set('starts_at', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Date de fin</label>
          <input type="datetime-local" value={form.ends_at} onChange={e => set('ends_at', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Tags (séparés par virgule)</label>
        <input
          type="text"
          value={form.tags}
          onChange={e => set('tags', e.target.value)}
          placeholder="BCE, taux, euro"
          className={inputCls}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className={labelCls + ' mb-0'}>Statut initial :</label>
        <select value={form.status} onChange={e => set('status', e.target.value)} className="border border-neutral-200 rounded px-2 py-1 text-xs text-neutral-800">
          <option value="draft">Brouillon</option>
          <option value="active">Actif</option>
        </select>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
        >
          {saving ? 'Enregistrement…' : 'Créer l\'événement'}
        </button>
        <a href="/admin/forecast" className="text-sm text-neutral-500 hover:text-neutral-700">Annuler</a>
      </div>
    </form>
  )
}
