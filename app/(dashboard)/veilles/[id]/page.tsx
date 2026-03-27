import { createClient } from '@/lib/supabase/server'
import { notFound }     from 'next/navigation'
import Link             from 'next/link'
import { ArrowLeft, FileText, Zap, AlertTriangle, Plus, ExternalLink, Globe, Newspaper, BarChart2, Search, BrainCircuit } from 'lucide-react'
import RunAgentsButton  from './RunAgentsButton'

const SUB_AGENT_ICONS: Record<string, any> = {
  web_scanner:             Globe,
  press_monitor:           Newspaper,
  analyst:                 BarChart2,
  deep_research:           Search,
  deep_research_iterative: BrainCircuit,
}

export default async function WatchDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: watch } = await supabase
    .from('watches')
    .select('*, watch_companies(companies(id, name, country, sector, website))')
    .eq('id', params.id)
    .single()

  if (!watch) notFound()

  const [
    { data: signals,   count: totalSignals },
    { data: reports },
    { data: jobs },
  ] = await Promise.all([
    supabase
      .from('signals')
      .select('*, companies(name)', { count: 'exact' })
      .eq('watch_id', params.id)
      .order('published_at', { ascending: false })   // ← published_at (pas collected_at)
      .limit(20),
    supabase
      .from('reports')
      .select('*')
      .eq('watch_id', params.id)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('agent_jobs')
      .select('*')
      .eq('watch_id', params.id)
      .order('started_at', { ascending: false })
      .limit(8),
  ])

  const companies  = watch.watch_companies?.map((wc: any) => wc.companies).filter(Boolean) ?? []
  const noCompanies = companies.length === 0

  // Dernier job Agent 1 avec son breakdown
  const lastScrapeJob = (jobs ?? []).find((j: any) => j.agent_number === 1)
  const breakdown     = lastScrapeJob?.metadata?.breakdown_agents as Record<string, number> | undefined

  function fmtDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function fmtDuration(start: string | null, end: string | null) {
    if (!start || !end) return null
    const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">

      {/* ── En-tête ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/veilles" className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 mb-2 transition-colors">
            <ArrowLeft size={12} /> Mes veilles
          </Link>
          <h2 className="text-lg font-bold text-neutral-900">{watch.name}</h2>
          <p className="text-xs text-neutral-500 mt-1">
            {watch.sectors?.join(', ')} · {watch.countries?.join(', ')} ·{' '}
            {watch.frequency === 'realtime' ? 'Temps réel' : watch.frequency === 'daily' ? 'Quotidienne' : 'Hebdomadaire'}
          </p>
        </div>
        <RunAgentsButton watchId={watch.id} hasCompanies={!noCompanies} />
      </div>

      {/* ── Alerte : aucune entreprise ───────────────────────────────────── */}
      {noCompanies && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl mb-5">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Aucune entreprise liée à cette veille</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Les agents de collecte recherchent des informations sur les entreprises que vous surveillez.
              Sans entreprises, les recherches seront uniquement sectorielles.
            </p>
          </div>
          <Link
            href={`/veilles/${params.id}/edit`}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex-shrink-0"
          >
            <Plus size={12} /> Ajouter des entreprises
          </Link>
        </div>
      )}

      {/* ── Métriques ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Entreprises',       value: companies.length },
          { label: 'Signaux collectés', value: totalSignals ?? 0 },
          { label: 'Rapports générés',  value: reports?.length ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="metric-card text-center">
            <div className="text-xl font-bold text-neutral-900">{value}</div>
            <div className="text-xs text-neutral-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Corps principal ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Signaux */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-neutral-900">Derniers signaux</h3>
              <span className="badge badge-blue text-[10px]">
                <Zap size={9} className="inline mr-0.5" />Live
              </span>
            </div>

            {signals && signals.length > 0 ? (
              <div className="space-y-3">
                {signals.map((s: any) => (
                  <div key={s.id} className="pb-3 border-b border-neutral-100 last:border-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                        {s.source_name && <span className="font-medium">{s.source_name}</span>}
                        {s.source_name && <span>·</span>}
                        {fmtDate(s.published_at)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {s.signal_type && (
                          <span className="badge badge-gray text-[9px]">{s.signal_type}</span>
                        )}
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-blue-600 transition-colors">
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                    {s.title && <div className="text-xs font-semibold text-neutral-900 mb-1">{s.title}</div>}
                    <div className="text-xs text-neutral-600 leading-relaxed line-clamp-2">
                      {s.raw_content?.slice(0, 180)}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      {s.companies?.name && (
                        <span className="text-[11px] text-blue-700 font-medium">{s.companies.name}</span>
                      )}
                      {s.relevance_score != null && (
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-1 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${s.relevance_score >= 0.7 ? 'bg-green-500' : s.relevance_score >= 0.5 ? 'bg-amber-500' : 'bg-neutral-400'}`}
                              style={{ width: `${s.relevance_score * 100}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-neutral-400">{Math.round(s.relevance_score * 100)}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <Zap size={24} className="text-neutral-200 mb-3" />
                <p className="text-sm text-neutral-500">Aucun signal collecté.</p>
                <p className="text-xs text-neutral-400 mt-1">
                  {noCompanies
                    ? 'Ajoutez des entreprises puis lancez le scan.'
                    : 'Cliquez sur "Lancer le scan" pour démarrer les 5 agents.'}
                </p>
              </div>
            )}
          </div>

          {/* Rapports */}
          {reports && reports.length > 0 && (
            <div className="card-lg">
              <h3 className="text-sm font-bold text-neutral-900 mb-4">Rapports générés</h3>
              <div className="space-y-2">
                {reports.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-blue-300 transition-colors">
                    <FileText size={16} className="text-blue-700 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 truncate">{r.title}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {r.type === 'synthesis' || r.type === 'analyse' ? 'Synthèse' : r.type === 'market' ? 'Analyse marché' : 'Stratégie'} ·{' '}
                        {fmtDate(r.created_at)}
                      </div>
                    </div>
                    {!r.is_read && <span className="w-2 h-2 rounded-full bg-blue-700 flex-shrink-0" />}
                    <span className={`badge text-[10px] ${r.type === 'synthesis' || r.type === 'analyse' ? 'badge-blue' : r.type === 'market' ? 'badge-green' : 'badge-purple'}`}>
                      Agent {r.agent_used ?? 2}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">

          {/* Entreprises */}
          <div className="card-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-neutral-900">Entreprises ({companies.length})</h3>
              <Link href={`/veilles/${params.id}/edit`} className="text-[10px] text-blue-600 hover:underline">Modifier</Link>
            </div>
            {companies.length > 0 ? (
              <div className="space-y-2">
                {companies.map((co: any, i: number) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {co?.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-neutral-900 truncate">{co?.name}</div>
                      <div className="text-[10px] text-neutral-400">{co?.country}</div>
                    </div>
                    {co?.website && (
                      <a href={co.website} target="_blank" rel="noopener noreferrer" className="text-neutral-300 hover:text-blue-500 transition-colors flex-shrink-0">
                        <Globe size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <Link
                href={`/veilles/${params.id}/edit`}
                className="flex items-center justify-center gap-1.5 w-full py-3 border-2 border-dashed border-neutral-200 rounded-lg text-xs text-neutral-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                <Plus size={12} /> Ajouter des entreprises
              </Link>
            )}
          </div>

          {/* Derniers scans — avec breakdown sous-agents */}
          {jobs && jobs.length > 0 && (
            <div className="card-lg">
              <h3 className="text-sm font-bold text-neutral-900 mb-3">Derniers scans</h3>
              <div className="space-y-2.5">
                {jobs.map((job: any) => {
                  const dur = fmtDuration(job.started_at, job.completed_at)
                  const bd  = job.metadata?.breakdown_agents as Record<string, number> | undefined
                  return (
                    <div key={job.id} className="text-xs border-b border-neutral-50 pb-2.5 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          job.status === 'done' ? 'bg-green-500' :
                          job.status === 'running' ? 'bg-amber-500' : 'bg-red-500'
                        }`} />
                        <span className="text-neutral-600 font-medium">Agent {job.agent_number}</span>
                        {job.signals_count != null && (
                          <span className="text-neutral-400">{job.signals_count} signaux</span>
                        )}
                        <span className={`badge text-[9px] ml-auto ${
                          job.status === 'done' ? 'badge-green' :
                          job.status === 'running' ? 'badge-amber' : 'badge-red'
                        }`}>{job.status === 'done' ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Erreur'}</span>
                      </div>
                      {dur && <div className="text-[10px] text-neutral-400 mt-0.5 pl-3.5">{dur} · {fmtDate(job.started_at)}</div>}
                      {/* Breakdown des 5 sous-agents */}
                      {bd && job.agent_number === 1 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 pl-3.5">
                          {Object.entries(bd).map(([key, val]) => {
                            const Icon = SUB_AGENT_ICONS[key]
                            return (
                              <span key={key} className="flex items-center gap-0.5 text-[9px] bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded" title={key}>
                                {Icon && <Icon size={8} className="text-neutral-400" />}
                                {val}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Détail du dernier breakdown Agent 1 */}
          {breakdown && (
            <div className="card-lg">
              <h3 className="text-sm font-bold text-neutral-900 mb-3">Breakdown dernier scan</h3>
              <div className="space-y-2">
                {Object.entries(breakdown).map(([key, val]) => {
                  const Icon  = SUB_AGENT_ICONS[key] ?? Search
                  const label = key.replace(/_/g, ' ').replace('deep research iterative', 'Deep Research IA')
                  const max   = Math.max(...Object.values(breakdown), 1)
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <Icon size={11} className="text-neutral-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-neutral-600 capitalize truncate">{label}</span>
                          <span className="text-[10px] font-bold text-neutral-700 ml-1">{val}</span>
                        </div>
                        <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${(val / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
