'use client'

import { useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Bot } from 'lucide-react'

function fmtDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—'
  const s = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function JobsHistory({ jobs }: { jobs: any[] }) {
  const [visible, setVisible] = useState(true)

  return (
    <div className="card-lg">
      <button
        onClick={() => setVisible(!visible)}
        className="flex items-center justify-between w-full mb-0"
      >
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-neutral-500" />
          <h3 className="text-sm font-bold text-neutral-900">Historique des jobs récents</h3>
          <span className="text-[10px] text-neutral-400 font-normal">({jobs.length})</span>
        </div>
        {visible
          ? <ChevronUp size={16} className="text-neutral-400" />
          : <ChevronDown size={16} className="text-neutral-400" />}
      </button>

      {visible && (
        <>
          {jobs.length > 0 ? (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-xs min-w-[700px]">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    {['Agent', 'Veille', 'Statut', 'Signaux', 'Durée', 'Lancé le'].map(h => (
                      <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job: any) => (
                    <tr key={job.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                      <td className="py-2.5 px-3">
                        <span className={`badge text-[10px] ${
                          job.agent_number === 1 ? 'bg-orange-100 text-orange-700' :
                          job.agent_number === 2 ? 'badge-amber' :
                          job.agent_number === 3 ? 'badge-blue' : 'badge-purple'
                        }`}>
                          A{job.agent_number}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-neutral-800 max-w-[180px] truncate">
                        {job.watches?.name || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`badge text-[10px] ${
                          job.status === 'done'    ? 'badge-green' :
                          job.status === 'running' ? 'badge-amber' : 'badge-red'
                        }`}>
                          {job.status === 'done' ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Erreur'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600 font-medium">
                        {job.signals_count != null ? (
                          <span className="flex items-center gap-1">
                            {job.signals_count}
                            {job.metadata?.breakdown_agents && (
                              <span className="text-neutral-400 font-normal text-[9px]">
                                (DR:{job.metadata.breakdown_agents.deep_research_iterative ?? 0})
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500">
                        {fmtDuration(job.started_at, job.completed_at)}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500">
                        {fmtDate(job.started_at ?? job.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-10 text-center mt-4">
              <Bot size={28} className="text-neutral-200 mx-auto mb-3" />
              <p className="text-sm text-neutral-400">Aucun job enregistré pour l&apos;instant.</p>
              <p className="text-xs text-neutral-400 mt-1">Les agents se déclenchent quand les utilisateurs lancent des scans depuis la page Agents.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
