import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, Bot, CheckCircle, Clock, XCircle, TrendingUp, Radio, Zap, Pause } from 'lucide-react'
import { ForecastAdminActions } from './ForecastAdminActions'

export const dynamic = 'force-dynamic'

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

type Search = { status?: string; source?: string }

export default async function ForecastAdminPage({ searchParams }: { searchParams: Search }) {
  const db = createAdminClient()
  const statusFilter = searchParams?.status ?? 'all'
  const sourceFilter = searchParams?.source ?? 'all'

  let questionsQuery = db
    .from('forecast_questions')
    .select('id, slug, title, status, close_date, featured, tags, created_by, forecast_count, crowd_probability, ai_probability, blended_probability, created_at, forecast_channels ( id, slug, name ), forecast_events ( id, slug, title )')
    .order('created_at', { ascending: false })
    .limit(200)

  if (statusFilter !== 'all') questionsQuery = questionsQuery.eq('status', statusFilter)
  if (sourceFilter === 'ia') questionsQuery = questionsQuery.is('created_by', null)
  if (sourceFilter === 'admin') questionsQuery = questionsQuery.not('created_by', 'is', null)

  const [{ data: questions }, { data: channels }, { data: events }, { data: recentSignals }] = await Promise.all([
    questionsQuery,
    db.from('forecast_channels').select('id, slug, name').eq('is_active', true).order('sort_order'),
    db.from('forecast_events').select('id, slug, title, channel_id, status').order('created_at', { ascending: false }).limit(50),
    db.from('forecast_signal_feed').select('id, signal_type, title, severity, created_at').order('created_at', { ascending: false }).limit(5),
  ])

  const stats = {
    total: questions?.length ?? 0,
    open: questions?.filter(q => q.status === 'open').length ?? 0,
    paused: questions?.filter(q => q.status === 'paused').length ?? 0,
    closed: questions?.filter(q => q.status === 'closed').length ?? 0,
    draft: questions?.filter(q => q.status === 'draft').length ?? 0,
  }
  const signalCount = recentSignals?.length ?? 0
  const SIGNAL_TYPE_META: Record<string, { label: string; color: string }> = {
    news:              { label: 'Actualité', color: 'bg-violet-100 text-violet-700' },
    probability_shift: { label: 'Glissement', color: 'bg-blue-100 text-blue-700' },
    resolution:        { label: 'Résolu', color: 'bg-green-100 text-green-700' },
  }

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2"><TrendingUp size={18} className="text-blue-600" />Forecast Éditorial</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Questions manuelles ou générées automatiquement (worker <strong>forecast:question-generator</strong>, toutes les 6 h). Les brouillons IA ont <code className="text-[11px] bg-neutral-100 px-1 rounded">created_by</code> vide — publiez ou éditez ici.
          </p>
        </div>
        <Link href="/admin/forecast/questions/new" className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"><Plus size={14} />Nouvelle question</Link>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Radio size={15} className="text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Signaux d'actualité</h3>
              <p className="text-xs text-neutral-500">
                Générés automatiquement par le worker — 1er run au démarrage, puis toutes les 2h.
              </p>
            </div>
          </div>
          <Link href="/forecast/signals" target="_blank"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Voir le feed →
          </Link>
        </div>

        {signalCount === 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <Zap size={12} /> Aucun signal dans la base
            </p>
            <p className="text-xs text-amber-700">
              Le worker génère les signaux automatiquement au démarrage.
              Sur Hostinger : <code className="bg-amber-100 px-1 rounded">git pull &amp;&amp; npm run build &amp;&amp; pm2 restart ecosystem.config.js</code>
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Derniers signaux ({signalCount} affichés)
            </p>
            {recentSignals?.map(s => {
              const meta = SIGNAL_TYPE_META[s.signal_type] ?? { label: s.signal_type, color: 'bg-neutral-100 text-neutral-600' }
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs text-neutral-700 py-1.5 border-b border-neutral-50 last:border-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.color} flex-shrink-0`}>{meta.label}</span>
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-neutral-400 flex-shrink-0">
                    {new Date(s.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[{ label: 'Total', value: stats.total, icon: TrendingUp, color: 'text-neutral-600' }, { label: 'Ouvertes', value: stats.open, icon: CheckCircle, color: 'text-green-600' }, { label: 'En pause', value: stats.paused, icon: Pause, color: 'text-orange-600' }, { label: 'Fermées', value: stats.closed, icon: Clock, color: 'text-amber-600' }, { label: 'Brouillons', value: stats.draft, icon: XCircle, color: 'text-neutral-400' }].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3">
            <Icon size={20} className={color} />
            <div><div className="text-2xl font-bold text-neutral-900">{value}</div><div className="text-xs text-neutral-500">{label}</div></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-semibold text-neutral-800">Questions ({questions?.length ?? 0} affichées)</span>
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
              {!questions?.length && <tr><td colSpan={9} className="text-center text-sm text-neutral-400 py-12">Aucune question.</td></tr>}
              {questions?.map(q => {
                const meta = STATUS_META[q.status] ?? STATUS_META.draft
                const channel = (q as { forecast_channels?: { name?: string } }).forecast_channels
                const createdBy = (q as { created_by?: string | null }).created_by
                const isIa = createdBy == null
                return (
                  <tr key={q.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-4 py-3 max-w-xs"><div className="font-medium text-neutral-900 truncate" title={q.title}>{q.title}</div><div className="text-xs text-neutral-400 mt-0.5">/{q.slug}</div></td>
                    <td className="px-3 py-3"><span className="text-xs text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full">{channel?.name ?? '—'}</span></td>
                    <td className="px-3 py-3">
                      {isIa ? (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">IA</span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">Admin</span>
                      )}
                    </td>
                    <td className="px-3 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span></td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-neutral-700">{fmtProb(q.crowd_probability)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-blue-700">{fmtProb(q.ai_probability)}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-neutral-900">{fmtProb(q.blended_probability)}</td>
                    <td className="px-3 py-3 text-xs text-neutral-500">{fmtDate(q.close_date)}</td>
                    <td className="px-4 py-3 text-right"><ForecastAdminActions questionId={q.id} status={q.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-800">Événements ({events?.length ?? 0})</span>
          <Link href="/admin/forecast/events/new" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"><Plus size={12} />Ajouter</Link>
        </div>
        <div className="divide-y divide-neutral-50">
          {!events?.length && <div className="text-center text-sm text-neutral-400 py-8">Aucun événement.</div>}
          {events?.map(ev => {
            const ch = channels?.find(c => c.id === ev.channel_id)
            const evMeta = EVENT_STATUS_META[ev.status] ?? { label: ev.status, color: 'bg-neutral-100 text-neutral-500' }
            return (
              <div key={ev.id} className="px-5 py-3 flex items-center justify-between hover:bg-neutral-50">
                <div><div className="text-sm font-medium text-neutral-800">{ev.title}</div><div className="text-xs text-neutral-400">{ch?.name ?? '—'} · /{ev.slug}</div></div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${evMeta.color}`}>{evMeta.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
