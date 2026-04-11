'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Channel { id: string; slug: string; name: string }
interface ForecastEvent { id: string; slug: string; title: string; channel_id: string }
interface Props { channels: Channel[]; events: ForecastEvent[] }

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

export function NewQuestionForm({ channels, events }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '')
  const [eventMode, setEventMode] = useState<'existing' | 'new'>('existing')
  const [newEventTitle, setNewEventTitle] = useState('')
  const filteredEvents = events.filter(e => e.channel_id === channelId)
  const [form, setForm] = useState({
    event_id: '',
    slug: '',
    title: '',
    close_date: '',
    resolution_source: '',
    resolution_criteria: '',
    resolution_url: '',
    tags: '',
    featured: false,
    advanced: false,
  })

  function set(k: keyof typeof form, v: string | boolean) {
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
      const payload: Record<string, unknown> = {
        channel_id: channelId,
        title: form.title,
        close_date: new Date(form.close_date).toISOString(),
        status: 'open',
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        featured: form.featured,
      }
      if (form.slug.trim()) payload.slug = form.slug.trim()
      if (form.resolution_source.trim()) payload.resolution_source = form.resolution_source.trim()
      if (form.resolution_criteria.trim()) payload.resolution_criteria = form.resolution_criteria.trim()
      if (form.resolution_url.trim()) payload.resolution_url = form.resolution_url.trim()

      if (eventMode === 'existing') {
        if (!form.event_id) {
          setError('Choisissez un événement ou passez en « Nouvel événement ».')
          setSaving(false)
          return
        }
        payload.event_id = form.event_id
      } else {
        if (!newEventTitle.trim()) {
          setError('Titre du nouvel événement requis.')
          setSaving(false)
          return
        }
        payload.new_event = { title: newEventTitle.trim() }
      }

      const res = await fetch('/api/admin/forecast/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Erreur inconnue')
        return
      }
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
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

      <p className="text-xs text-neutral-500">
        Création rapide : seuls le canal, le titre et la date de clôture sont obligatoires. Les critères de résolution par défaut couvrent une question binaire Oui/Non vérifiable sur sources publiques.
      </p>

      <div>
        <label className={labelCls}>Canal *</label>
        <select
          value={channelId}
          onChange={e => {
            setChannelId(e.target.value)
            set('event_id', '')
          }}
          className={inputCls}
          required
        >
          {channels.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <span className={labelCls}>Événement *</span>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="evmode" checked={eventMode === 'existing'} onChange={() => setEventMode('existing')} />
            Existant
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="evmode" checked={eventMode === 'new'} onChange={() => setEventMode('new')} />
            Nouvel événement
          </label>
        </div>
        {eventMode === 'existing' ? (
          <select value={form.event_id} onChange={e => set('event_id', e.target.value)} className={inputCls} required={eventMode === 'existing'}>
            <option value="">— Choisir —</option>
            {filteredEvents.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={newEventTitle}
            onChange={e => setNewEventTitle(e.target.value)}
            placeholder="Ex. : Tensions commerciales USA–Chine (Q2 2026)"
            className={inputCls}
          />
        )}
        {eventMode === 'existing' && !filteredEvents.length && (
          <p className="text-xs text-amber-600">
            Aucun événement pour ce canal — utilisez « Nouvel événement » ou{' '}
            <a href="/admin/forecast/events/new" className="underline">créez un événement</a>.
          </p>
        )}
      </div>

      <div>
        <label className={labelCls}>Question / titre *</label>
        <input
          type="text"
          value={form.title}
          onChange={e => handleTitleChange(e.target.value)}
          placeholder="Ex. : La BCE baissera-t-elle ses taux avant juillet 2026 ?"
          className={inputCls}
          required
        />
      </div>

      <div>
        <label className={labelCls}>Date de clôture *</label>
        <input type="datetime-local" value={form.close_date} onChange={e => set('close_date', e.target.value)} className={inputCls} required />
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
        <input type="checkbox" checked={form.advanced} onChange={e => set('advanced', e.target.checked)} className="rounded" />
        Options avancées (slug, résolution personnalisée, tags…)
      </label>

      {form.advanced && (
        <div className="space-y-4 pl-3 border-l-2 border-neutral-100">
          <div>
            <label className={labelCls}>Slug</label>
            <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)} className={inputCls} placeholder="Généré depuis le titre si vide" />
          </div>
          <div>
            <label className={labelCls}>Source de résolution</label>
            <input type="text" value={form.resolution_source} onChange={e => set('resolution_source', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Critères de résolution</label>
            <textarea value={form.resolution_criteria} onChange={e => set('resolution_criteria', e.target.value)} rows={3} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>URL de résolution</label>
            <input type="url" value={form.resolution_url} onChange={e => set('resolution_url', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tags (virgules)</label>
            <input type="text" value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} className="rounded" />
            Mettre en avant
          </label>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">
          {saving ? 'Création…' : 'Créer et publier'}
        </button>
        <a href="/admin/forecast" className="text-sm text-neutral-500 hover:text-neutral-700">Annuler</a>
      </div>
    </form>
  )
}
