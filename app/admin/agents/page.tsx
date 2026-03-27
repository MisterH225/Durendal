import { createClient } from '@/lib/supabase/server'
import { Bot, CheckCircle2, XCircle, Clock, Zap, Settings2 } from 'lucide-react'

const AGENTS = [
  {
    num: 1,
    name: 'Agent Collecte',
    description: 'Scrape les sources web, réseaux sociaux et actualités pour collecter les signaux bruts.',
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  {
    num: 2,
    name: 'Agent Synthèse',
    description: 'Analyse et résume les signaux collectés en insights actionnables par secteur/pays.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  {
    num: 3,
    name: 'Agent Analyse Marché',
    description: 'Identifie les tendances, opportunités et menaces sur les marchés surveillés.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    num: 4,
    name: 'Agent Stratégie',
    description: 'Formule des recommandations stratégiques personnalisées basées sur les analyses.',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
]

export default async function AdminAgentsPage() {
  const supabase = createClient()

  const [
    { data: recentJobs },
    { count: totalJobs },
    { count: runningJobs },
    { count: failedJobs },
  ] = await Promise.all([
    supabase.from('agent_jobs').select('*, watches(name)').order('created_at', { ascending: false }).limit(20),
    supabase.from('agent_jobs').select('*', { count: 'exact', head: true }),
    supabase.from('agent_jobs').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supabase.from('agent_jobs').select('*', { count: 'exact', head: true }).eq('status', 'error'),
  ])

  const jobsByAgent = (recentJobs || []).reduce((acc: Record<number, any[]>, job: any) => {
    const n = job.agent_number || 1
    if (!acc[n]) acc[n] = []
    acc[n].push(job)
    return acc
  }, {})

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Configuration des agents IA</h2>
        <span className="badge badge-blue text-xs">4 agents disponibles</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Jobs total', value: totalJobs || 0, icon: Bot, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'En cours', value: runningJobs || 0, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'En erreur', value: failedJobs || 0, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-neutral-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <div className="text-2xl font-bold text-neutral-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Agents cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {AGENTS.map(({ num, name, description, color, bg, border }) => {
          const jobs = jobsByAgent[num] || []
          const lastJob = jobs[0]
          const successCount = jobs.filter((j: any) => j.status === 'done').length
          const isRunning = jobs.some((j: any) => j.status === 'running')

          return (
            <div key={num} className={`card-lg border-l-4 ${border}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                    <Bot size={16} className={color} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-neutral-900">Agent {num} — {name}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{description}</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-neutral-100">
                <div className={`flex items-center gap-1 text-xs font-medium ${isRunning ? 'text-amber-600' : 'text-green-600'}`}>
                  {isRunning
                    ? <><Clock size={12} /> En cours</>
                    : <><CheckCircle2 size={12} /> Disponible</>
                  }
                </div>
                <span className="text-neutral-200">|</span>
                <span className="text-xs text-neutral-400">{jobs.length} jobs récents</span>
                {jobs.length > 0 && (
                  <>
                    <span className="text-neutral-200">|</span>
                    <span className="text-xs text-neutral-400">
                      {successCount}/{jobs.length} réussis
                    </span>
                  </>
                )}
                {lastJob && (
                  <>
                    <span className="text-neutral-200">|</span>
                    <span className="text-xs text-neutral-400">
                      Dernier : {new Date(lastJob.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Recent jobs table */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-neutral-900">Historique des jobs récents</h3>
          <Settings2 size={14} className="text-neutral-400" />
        </div>

        {recentJobs && recentJobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  {['Agent', 'Veille', 'Statut', 'Durée', 'Lancé le'].map(h => (
                    <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job: any) => {
                  const duration = job.completed_at && job.created_at
                    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.created_at).getTime()) / 1000)
                    : null

                  return (
                    <tr key={job.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className={`badge text-[10px] ${
                          job.agent_number === 1 ? 'badge-green' :
                          job.agent_number === 2 ? 'badge-amber' :
                          job.agent_number === 3 ? 'badge-blue' : 'badge-purple'
                        }`}>A{job.agent_number}</span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-neutral-800">{job.watches?.name || '—'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`badge text-[10px] ${
                          job.status === 'done' ? 'badge-green' :
                          job.status === 'running' ? 'badge-amber' : 'badge-red'
                        }`}>
                          {job.status === 'done' ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Erreur'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500">
                        {duration != null ? `${duration}s` : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500">
                        {new Date(job.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center">
            <Bot size={28} className="text-neutral-200 mx-auto mb-3" />
            <p className="text-sm text-neutral-400">Aucun job enregistré pour l&apos;instant.</p>
            <p className="text-xs text-neutral-400 mt-1">Les agents se déclenchent quand les utilisateurs lancent des scans.</p>
          </div>
        )}
      </div>
    </div>
  )
}
