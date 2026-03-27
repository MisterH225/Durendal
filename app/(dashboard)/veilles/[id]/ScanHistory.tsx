'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Globe, Newspaper, BarChart2, Search, BrainCircuit } from 'lucide-react'

const SUB_AGENT_ICONS: Record<string, any> = {
  web_scanner:             Globe,
  press_monitor:           Newspaper,
  analyst:                 BarChart2,
  deep_research:           Search,
  deep_research_iterative: BrainCircuit,
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(start: string | null, end: string | null) {
  if (!start || !end) return null
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

interface Props {
  jobs: any[]
}

export default function ScanHistory({ jobs }: Props) {
  const [open, setOpen] = useState(false)

  if (!jobs || jobs.length === 0) return null

  // Résumé pour l'état replié
  const lastJob   = jobs[0]
  const lastDate  = fmtDate(lastJob?.started_at)
  const doneCount = jobs.filter((j: any) => j.status === 'done').length

  return (
    <div className="card-lg">
      {/* En-tête cliquable */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-neutral-900">Derniers scans</h3>
          <span className="badge badge-gray text-[9px]">{jobs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {!open && (
            <span className="text-[10px] text-neutral-400">
              {lastDate} · {doneCount}/{jobs.length} ok
            </span>
          )}
          <div className="w-5 h-5 rounded-full bg-neutral-100 group-hover:bg-neutral-200 flex items-center justify-center transition-colors flex-shrink-0">
            {open
              ? <ChevronUp  size={11} className="text-neutral-500" />
              : <ChevronDown size={11} className="text-neutral-500" />}
          </div>
        </div>
      </button>

      {/* Contenu dépliable */}
      {open && (
        <div className="space-y-2.5 mt-3 pt-3 border-t border-neutral-100">
          {jobs.map((job: any) => {
            const dur = fmtDuration(job.started_at, job.completed_at)
            const bd  = job.metadata?.breakdown_agents as Record<string, number> | undefined
            return (
              <div key={job.id} className="text-xs border-b border-neutral-50 pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    job.status === 'done'    ? 'bg-green-500' :
                    job.status === 'running' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <span className="text-neutral-600 font-medium">Agent {job.agent_number}</span>
                  {job.signals_count != null && (
                    <span className="text-neutral-400">{job.signals_count} signaux</span>
                  )}
                  <span className={`badge text-[9px] ml-auto ${
                    job.status === 'done'    ? 'badge-green' :
                    job.status === 'running' ? 'badge-amber' : 'badge-red'
                  }`}>
                    {job.status === 'done' ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Erreur'}
                  </span>
                </div>
                {dur && (
                  <div className="text-[10px] text-neutral-400 mt-0.5 pl-3.5">
                    {dur} · {fmtDate(job.started_at)}
                  </div>
                )}
                {/* Breakdown des 5 sous-agents */}
                {bd && job.agent_number === 1 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-3.5">
                    {Object.entries(bd).map(([key, val]) => {
                      const Icon = SUB_AGENT_ICONS[key]
                      return (
                        <span
                          key={key}
                          title={key}
                          className="flex items-center gap-0.5 text-[9px] bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded"
                        >
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
      )}
    </div>
  )
}
