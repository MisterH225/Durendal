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
  const filteredEvents = events.filter(e => e.channel_id === channelId)
  const [form, setForm] = useState({ event_id: '', slug: '', title: '', description: '', close_date: '', resolution_source: '', resolution_criteria: '', resolution_url: '', tags: '', featured: false, status: 'draft' })
  function set(k: keyof typeof form, v: string | boolean) { setForm(prev => ({ ...prev, [k]: v })) }
  function handleTitleChange(v: string) { set('title', v); if (!form.slug || form.slug === slugify(form.title)) set('slug', slugify(v)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      const res = await fetch('/api/admin/forecast/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel_id: channelId, event_id: form.event_id, slug: form.slug, title: form.title, description: form.description || null, close_date: new Date(form.close_date).toISOString(), resolution_source: form.resolution_source, resolution_criteria: form.resolution_criteria, resolution_url: form.resolution_url || null, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean), featured: form.featured, status: form.status }) })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erreur inconnue'); return }
      router.push('/admin/forecast'); router.refresh()
    } finally { setSaving(false) }
  }

  const inputCls = 'w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-neutral-400'
  const labelCls = 'block text-xs font-semibold text-neutral-700 mb-1'

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-neutral-200 p-6 space-y-5">
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
      <div><label className={labelCls}>Channel *</label><select value={channelId} onChange={e => { setChannelId(e.target.value); set('event_id', '') }} className={inputCls} required>{channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label className={labelCls}>Événement *</label><select value={form.event_id} onChange={e => set('event_id', e.target.value)} className={inputCls} required><option value="">— Choisir un événement —</option>{filteredEvents.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}</select>{!filteredEvents.length && <p className="text-xs text-amber-600 mt-1">Aucun événement actif. <a href="/admin/forecast/events/new" className="underline">Créer d&apos;abord.</a></p>}</div>
      <div><label className={labelCls}>Question / Titre *</label><input type="text" value={form.title} onChange={e => handleTitleChange(e.target.value)} placeholder="Ex : La BCE baissera-t-elle ses taux avant juillet 2026 ?" className={inputCls} required /></div>
      <div><label className={labelCls}>Slug *</label><input type="text" value={form.slug} onChange={e => set('slug', e.target.value)} className={inputCls} required /></div>
      <div><label className={labelCls}>Description</label><textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3} className={inputCls} /></div>
      <div><label className={labelCls}>Date de clôture *</label><input type="datetime-local" value={form.close_date} onChange={e => set('close_date', e.target.value)} className={inputCls} required /></div>
      <div><label className={labelCls}>Source de résolution *</label><input type="text" value={form.resolution_source} onChange={e => set('resolution_source', e.target.value)} className={inputCls} required /></div>
      <div><label className={labelCls}>Critères de résolution *</label><textarea value={form.resolution_criteria} onChange={e => set('resolution_criteria', e.target.value)} rows={3} className={inputCls} required /></div>
      <div><label className={labelCls}>URL de résolution</label><input type="url" value={form.resolution_url} onChange={e => set('resolution_url', e.target.value)} className={inputCls} /></div>
      <div><label className={labelCls}>Tags (virgule)</label><input type="text" value={form.tags} onChange={e => set('tags', e.target.value)} className={inputCls} /></div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer"><input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} className="rounded" />Featured</label>
        <div className="flex items-center gap-2"><span className="text-xs font-semibold text-neutral-700">Statut :</span><select value={form.status} onChange={e => set('status', e.target.value)} className="border border-neutral-200 rounded px-2 py-1 text-xs text-neutral-800"><option value="draft">Brouillon</option><option value="open">Publier</option></select></div>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors">{saving ? 'Enregistrement…' : 'Créer la question'}</button>
        <a href="/admin/forecast" className="text-sm text-neutral-500 hover:text-neutral-700">Annuler</a>
      </div>
    </form>
  )
}
