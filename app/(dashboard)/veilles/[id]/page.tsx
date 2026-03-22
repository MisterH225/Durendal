import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Play, FileText, Zap } from 'lucide-react'
import RunAgentsButton from './RunAgentsButton'

export default async function WatchDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const { data: watch } = await supabase
    .from('watches')
    .select('*, watch_companies(companies(name, country, sector, website))')
    .eq('id', params.id)
    .single()

  if (!watch) notFound()

  const { data: signals } = await supabase
    .from('signals')
    .select('*, companies(name), sources(name)')
    .eq('watch_id', params.id)
    .order('collected_at', { ascending: false })
    .limit(20)

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('watch_id', params.id)
    .order('generated_at', { ascending: false })
    .limit(10)

  const { data: jobs } = await supabase
    .from('agent_jobs')
    .select('*')
    .eq('watch_id', params.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const companies = watch.watch_companies?.map((wc: any) => wc.companies) || []

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
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
        <RunAgentsButton watchId={watch.id} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Entreprises', value: companies.length },
          { label: 'Signaux collectés', value: signals?.length || 0 },
          { label: 'Rapports générés', value: reports?.length || 0 },
        ].map(({ label, value }) => (
          <div key={label} className="metric-card text-center">
            <div className="text-xl font-bold text-neutral-900">{value}</div>
            <div className="text-xs text-neutral-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Signals */}
        <div className="lg:col-span-2">
          <div className="card-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-neutral-900">Derniers signaux</h3>
              <span className="badge badge-blue">
                <Zap size={10} className="inline mr-1" />Live
              </span>
            </div>
            {signals && signals.length > 0 ? (
              <div className="space-y-3">
                {signals.map((s: any) => (
                  <div key={s.id} className="pb-3 border-b border-neutral-100 last:border-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-[10px] text-neutral-400">
                        {s.sources?.name} · {new Date(s.collected_at).toLocaleDateString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>
                      {s.signal_type && (
                        <span className="badge badge-gray text-[9px] flex-shrink-0">{s.signal_type}</span>
                      )}
                    </div>
                    {s.title && <div className="text-xs font-semibold text-neutral-900 mb-1">{s.title}</div>}
                    <div className="text-xs text-neutral-600 leading-relaxed line-clamp-2">
                      {s.raw_content?.slice(0, 150)}...
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      {s.companies?.name && (
                        <span className="text-[11px] text-blue-700 font-medium">{s.companies.name}</span>
                      )}
                      {s.relevance_score && (
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-1 bg-neutral-100 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${s.relevance_score * 100}%` }} />
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
                <p className="text-xs text-neutral-400">Aucun signal collecté.</p>
                <p className="text-xs text-neutral-400">Lancez l'agent de collecte pour démarrer.</p>
              </div>
            )}
          </div>

          {/* Reports */}
          {reports && reports.length > 0 && (
            <div className="card-lg mt-4">
              <h3 className="text-sm font-bold text-neutral-900 mb-4">Rapports générés</h3>
              <div className="space-y-2">
                {reports.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                    <FileText size={16} className="text-blue-700 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-neutral-900 truncate">{r.title}</div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">
                        {r.type === 'synthesis' ? 'Synthèse' : r.type === 'market' ? 'Analyse marché' : 'Stratégie'} ·{' '}
                        {new Date(r.generated_at).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                    {!r.is_read && <span className="w-2 h-2 rounded-full bg-blue-700 flex-shrink-0" />}
                    <span className={`badge text-[10px] ${r.type === 'synthesis' ? 'badge-blue' : r.type === 'market' ? 'badge-green' : 'badge-purple'}`}>
                      Agent {r.agent_used}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Companies */}
          <div className="card-lg">
            <h3 className="text-sm font-bold text-neutral-900 mb-3">Entreprises ({companies.length})</h3>
            <div className="space-y-2">
              {companies.map((co: any, i: number) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {co?.name?.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-neutral-900 truncate">{co?.name}</div>
                    <div className="text-[10px] text-neutral-400">{co?.country}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Agent jobs history */}
          {jobs && jobs.length > 0 && (
            <div className="card-lg">
              <h3 className="text-sm font-bold text-neutral-900 mb-3">Derniers scans</h3>
              <div className="space-y-2">
                {jobs.map((job: any) => (
                  <div key={job.id} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      job.status === 'done' ? 'bg-green-500' :
                      job.status === 'running' ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                    <span className="text-neutral-600">Agent {job.agent_number}</span>
                    <span className={`badge text-[10px] ml-auto ${
                      job.status === 'done' ? 'badge-green' :
                      job.status === 'running' ? 'badge-amber' : 'badge-red'
                    }`}>{job.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
