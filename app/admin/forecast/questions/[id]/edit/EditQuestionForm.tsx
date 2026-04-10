'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Channel { id: string; slug: string; name: string }
interface ForecastEvent { id: string; slug: string; title: string; channel_id: string }
interface Question {
  id: string
  channel_id: string
  event_id: string
  slug: string
  title: string
  description: string | null
  close_date: string
  resolution_source: string
  resolution_criteria: string
  resolution_url: string | null
  status: string
  tags: string[]
  featured: boolean
}

interface Props {
  question: Question
  channels: Channel[]
  events: ForecastEvent[]
}

export function EditQuestionForm({ question, channels, events }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [channelId, setChannelId] = useState(question.channel_id)
  const filteredEvents = events.filter(e => e.channel_id === channelId)

  // Format datetime-local (YYYY-MM-DDTHH:MM)
  const fmtDatetime = (iso: string) => iso ? iso.slice(0, 16) : ''

  const [form, setForm] = useState({
    event_id:            question.event_id,
    slug:                question.slug,
    title:               question.title,
    description:         question.description ?? '',
    close_date:          fmtDatetime(question.close_date),
    resolution_source:   question.resolution_source,
    resolution_criteria: question.resolution_criteria,
    resolution_url:      question.resolution_url ?? '',
    status:              question.status,
    tags:                (question.tags ?? []).join(', '),
    featured:            question.featured,
  })

  function set(k: keyof typeof form, v: string | boolean) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/forecast/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id:          channelId,
          event_id:            form.event_id,
          slug:                form.slug,
          title:               form.title,
          description:         form.description || null,
          close_date:          new Date(form.close_date).toISOString(),
          resolution_source:   form.resolution_source,
          resolution_criteria: form.resolution_criteria,
          resolution_url:      form.resolution_url || null,
          status:              form.status,
          tags:                form.tags.split(',').map(t => t.trim()).filter(Boolean),
          featured:            form.featured,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return }
      setSuccess(true)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleResolve(outcome: 'resolved_yes' | 'resolved_no' | 'annulled') {
    if (!confirm(`Confirmer la résolution : ${outcome} ?`)) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/forecast/questions/${question.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error); return }
      router.push('/admin/forecast')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-neutral-400'
  const labelCls = 'block text-xs font-semibold text-neutral-700 mb-1'

  const isResolved = ['resolved_yes', 'resolved_no', 'annulled'].includes(question.status)

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">Modifications sauvegardées.</div>
        )}

        <div>
          <label className={labelCls}>Channel *</label>
          <select
            value={channelId}
            onChange={e => { setChannelId(e.target.value); set('event_id', '') }}
            className={inputCls}
            required
          >
            {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Événement *</label>
          <select value={form.event_id} onChange={e => set('event_id', e.target.value)} className={inputCls} required>
            <option value="">— Choisir un événement —</option>
            {filteredEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>Question / Titre *</label>
          <input type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} required />
        </div>

        <div>
          <label className={labelCls}>Slug *</label>
          <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)} className={inputCls} required />
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Date de clôture *</label>
          <input type="datetime-local" value={form.close_date} onChange={e => set('close_date', e.target.value)} className={inputCls} required />
        </div>

        <div>
          <label className={labelCls}>Source de résolution *</label>
          <input type="text" value={form.resolution_source} onChange={e => set('resolution_source', e.target.value)} className={inputCls} required />
        </div>

        <div>
          <label className={labelCls}>Critères de résolution *</label>
          <textarea value={form.resolution_criteria} onChange={e => set('resolution_criteria', e.target.value)} rows={3} className={inputCls} required />
        </div>

        <div>
          <label className={labelCls}>URL de résolution</label>
          <input type="url" value={form.resolution_url} onChange={e => set('resolution_url', e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Tags (séparés par virgule)</label>
          <input type="text" value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} />
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} className="rounded" />
            Mettre en avant (featured)
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-neutral-700">Statut :</span>
            <select value={form.status} onChange={e => set('status', e.target.value)} className="border border-neutral-200 rounded px-2 py-1 text-xs text-neutral-800" disabled={isResolved}>
              <option value="draft">Brouillon</option>
              <option value="open">Ouvert</option>
              <option value="closed">Fermé</option>
              {isResolved && <option value={question.status}>{question.status}</option>}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
          <a href="/admin/forecast" className="text-sm text-neutral-500 hover:text-neutral-700">← Retour</a>
        </div>
      </form>

      {/* Resolution panel */}
      {!isResolved && (
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <div className="text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wider">Résolution</div>
          <p className="text-xs text-neutral-500 mb-4">
            Une fois résolue, la question est fermée définitivement et les scores Brier sont calculés pour tous les participants.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleResolve('resolved_yes')}
              disabled={saving}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              Résoudre OUI ✓
            </button>
            <button
              onClick={() => handleResolve('resolved_no')}
              disabled={saving}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              Résoudre NON ✗
            </button>
            <button
              onClick={() => handleResolve('annulled')}
              disabled={saving}
              className="px-3 py-1.5 bg-neutral-400 hover:bg-neutral-500 text-white text-xs rounded-lg font-medium disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
