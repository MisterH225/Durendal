'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, ChevronDown } from 'lucide-react'
import { ForecastAdminActions } from './ForecastAdminActions'
import { EventActions } from './EventActions'

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Brouillon',  color: 'bg-neutral-200 text-neutral-700' },
  open:         { label: 'Ouvert',     color: 'bg-green-100 text-green-800' },
  paused:       { label: 'En pause',  color: 'bg-orange-100 text-orange-800' },
  closed:       { label: 'Fermé',      color: 'bg-amber-100 text-amber-800' },
  resolved_yes: { label: 'Oui ✓',     color: 'bg-blue-100 text-blue-800' },
  resolved_no:  { label: 'Non ✗',     color: 'bg-red-100 text-red-800' },
  annulled:     { label: 'Annulé',     color: 'bg-neutral-100 text-neutral-500' },
}

const EVENT_STATUS_META: Record<string, { label: string; color: string }> = {
  draft:    { label: 'Brouillon', color: 'bg-neutral-200 text-neutral-700' },
  active:   { label: 'Actif',     color: 'bg-green-100 text-green-800' },
  closed:   { label: 'Fermé',     color: 'bg-amber-100 text-amber-800' },
  archived: { label: 'Archivé',   color: 'bg-neutral-100 text-neutral-500' },
}

function fmtProb(v: number | null) { return v === null ? '—' : `${Math.round(v * 100)}%` }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }

function filterHref(base: string, p: Record<string, string | undefined>) {
  const u = new URLSearchParams()
  Object.entries(p).forEach(([k, v]) => { if (v && v !== 'all') u.set(k, v) })
  const s = u.toString()
  return s ? `${base}?${s}` : base
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function matchesHaystack(haystack: string, needle: string) {
  const n = normalize(needle).trim()
  if (!n) return true
  const h = normalize(haystack)
  return n.split(/\s+/).every(part => part.length > 0 && h.includes(part))
}

type ChannelRef = { id?: string; name?: string | null } | null | undefined
type EventRef = { id?: string; slug?: string; title?: string | null } | null | undefined

function eventSearchBits(ev: EventRef | EventRef[] | null | undefined): string {
  if (ev == null) return ''
  if (Array.isArray(ev)) {
    return ev.map(e => [e?.title, e?.slug].filter(Boolean).join(' ')).join(' ')
  }
  return [ev.title, ev.slug].filter(Boolean).join(' ')
}

export type ForecastAdminQuestionRow = {
  id: string
  slug: string
  title: string
  status: string
  close_date: string | null
  created_by?: string | null
  crowd_probability: number | null
  ai_probability: number | null
  blended_probability: number | null
  forecast_channels?: ChannelRef
  forecast_events?: EventRef | EventRef[]
}

export type ForecastAdminEventRow = {
  id: string
  slug: string
  title: string
  channel_id: string
  status: string
}

type Channel = { id: string; name?: string | null }

type Props = {
  questions: ForecastAdminQuestionRow[]
  events: ForecastAdminEventRow[]
  channels: Channel[]
  statusFilter: string
  sourceFilter: string
}

export function ForecastQuestionsEventsPanel({
  questions,
  events,
  channels,
  statusFilter,
  sourceFilter,
}: Props) {
  const [qSearch, setQSearch] = useState('')
  const [evSearch, setEvSearch] = useState('')
  const [qOpen, setQOpen] = useState(true)
  const [evOpen, setEvOpen] = useState(true)

  const base = '/admin/forecast'

  const chip = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
        active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
      }`}
    >
      {label}
    </Link>
  )

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      const ch = q.forecast_channels
      const hay = [q.title, q.slug, ch?.name, eventSearchBits(q.forecast_events)].filter(Boolean).join(' ')
      return matchesHaystack(hay, qSearch)
    })
  }, [questions, qSearch])

  const filteredEvents = useMemo(() => {
    return events.filter(ev => {
      const ch = channels.find(c => c.id === ev.channel_id)
      const hay = [ev.title, ev.slug, ch?.name].filter(Boolean).join(' ')
      return matchesHaystack(hay, evSearch)
    })
  }, [events, channels, evSearch])

  return (
    <>
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setQOpen(o => !o)}
                className="flex-shrink-0 w-8 h-8 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 transition-colors"
                title={qOpen ? 'Réduire la section' : 'Développer la section'}
                aria-expanded={qOpen}
              >
                <ChevronDown size={18} className={`transition-transform ${qOpen ? '' : '-rotate-90'}`} />
              </button>
              <span className="text-sm font-semibold text-neutral-800 truncate">
                Questions ({filteredQuestions.length}
                {qSearch.trim() ? ` / ${questions.length}` : ''} affichées)
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto lg:max-w-md">
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="search"
                  value={qSearch}
                  onChange={e => setQSearch(e.target.value)}
                  placeholder="Rechercher (titre, slug, canal, événement)…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase">Statut</span>
            {chip('Tous', filterHref(base, { status: 'all', source: sourceFilter === 'all' ? undefined : sourceFilter }), statusFilter === 'all')}
            {chip('Brouillon', filterHref(base, { status: 'draft', source: sourceFilter === 'all' ? undefined : sourceFilter }), statusFilter === 'draft')}
            {chip('Ouvert', filterHref(base, { status: 'open', source: sourceFilter === 'all' ? undefined : sourceFilter }), statusFilter === 'open')}
            {chip('Pause', filterHref(base, { status: 'paused', source: sourceFilter === 'all' ? undefined : sourceFilter }), statusFilter === 'paused')}
            {chip('Fermé', filterHref(base, { status: 'closed', source: sourceFilter === 'all' ? undefined : sourceFilter }), statusFilter === 'closed')}
            <span className="text-[10px] font-semibold text-neutral-400 uppercase ml-2">Source</span>
            {chip('IA', filterHref(base, { status: statusFilter === 'all' ? undefined : statusFilter, source: 'ia' }), sourceFilter === 'ia')}
            {chip('Admin', filterHref(base, { status: statusFilter === 'all' ? undefined : statusFilter, source: 'admin' }), sourceFilter === 'admin')}
          </div>
        </div>
        {qOpen && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Question</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Channel</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Source</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Statut</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Crowd</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">IA</th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Blended</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Clôture</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {!filteredQuestions.length && (
                  <tr>
                    <td colSpan={9} className="text-center text-sm text-neutral-400 py-12">
                      {questions.length === 0 ? 'Aucune question.' : 'Aucun résultat pour cette recherche.'}
                    </td>
                  </tr>
                )}
                {filteredQuestions.map(q => {
                  const meta = STATUS_META[q.status] ?? STATUS_META.draft
                  const channel = q.forecast_channels
                  const createdBy = q.created_by
                  const isIa = createdBy == null
                  return (
                    <tr key={q.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-neutral-900 truncate" title={q.title}>{q.title}</div>
                        <div className="text-xs text-neutral-400 mt-0.5">/{q.slug}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-xs text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full">{channel?.name ?? '—'}</span>
                      </td>
                      <td className="px-3 py-3">
                        {isIa ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">IA</span>
                        ) : (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">Admin</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-neutral-700">{fmtProb(q.crowd_probability)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs text-blue-700">{fmtProb(q.ai_probability)}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-neutral-900">{fmtProb(q.blended_probability)}</td>
                      <td className="px-3 py-3 text-xs text-neutral-500">{fmtDate(q.close_date)}</td>
                      <td className="px-4 py-3 text-right">
                        <ForecastAdminActions questionId={q.id} status={q.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setEvOpen(o => !o)}
                className="flex-shrink-0 w-8 h-8 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 transition-colors"
                title={evOpen ? 'Réduire la section' : 'Développer la section'}
                aria-expanded={evOpen}
              >
                <ChevronDown size={18} className={`transition-transform ${evOpen ? '' : '-rotate-90'}`} />
              </button>
              <span className="text-sm font-semibold text-neutral-800 truncate">
                Événements ({filteredEvents.length}
                {evSearch.trim() ? ` / ${events.length}` : ''})
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full sm:w-auto">
              <div className="relative flex-1 min-w-0 sm:min-w-[220px] sm:max-w-md">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="search"
                  value={evSearch}
                  onChange={e => setEvSearch(e.target.value)}
                  placeholder="Rechercher (titre, slug, canal)…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-neutral-200 rounded-lg bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <Link
                href="/admin/forecast/events/new"
                className="inline-flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium sm:flex-shrink-0"
              >
                <Plus size={12} />Ajouter
              </Link>
            </div>
          </div>
        </div>
        {evOpen && (
          <div className="divide-y divide-neutral-50">
            {!filteredEvents.length && (
              <div className="text-center text-sm text-neutral-400 py-8">
                {events.length === 0 ? 'Aucun événement.' : 'Aucun résultat pour cette recherche.'}
              </div>
            )}
            {filteredEvents.map(ev => {
              const ch = channels.find(c => c.id === ev.channel_id)
              const evMeta = EVENT_STATUS_META[ev.status] ?? { label: ev.status, color: 'bg-neutral-100 text-neutral-500' }
              return (
                <div key={ev.id} className="px-5 py-3 flex items-center justify-between hover:bg-neutral-50">
                  <div>
                    <div className="text-sm font-medium text-neutral-800">{ev.title}</div>
                    <div className="text-xs text-neutral-400">{ch?.name ?? '—'} · /{ev.slug}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${evMeta.color}`}>{evMeta.label}</span>
                    <EventActions eventId={ev.id} title={ev.title} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
