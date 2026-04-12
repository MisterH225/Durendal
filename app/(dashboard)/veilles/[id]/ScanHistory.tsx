'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Zap, FileSearch, BrainCircuit } from 'lucide-react'

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

  const list = Array.isArray(jobs) ? jobs : []
  if (list.length === 0) return null

  const lastJob   = list[0]
  const lastDate  = fmtDate(lastJob?.started_at)
  const doneCount = list.filter((j: any) => j.status === 'done' || j.status === 'completed').length

  return (
    <div className="card-lg">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-neutral-900">Derniers scans</h3>
          <span className="badge badge-gray text-[9px]">{list.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {!open && (
            <span className="text-[10px] text-neutral-400">
              {lastDate} · {doneCount}/{list.length} ok
            </span>
          )}
          <div className="w-5 h-5 rounded-full bg-neutral-100 group-hover:bg-neutral-200 flex items-center justify-center transition-colors flex-shrink-0">
            {open
              ? <ChevronUp  size={11} className="text-neutral-500" />
              : <ChevronDown size={11} className="text-neutral-500" />}
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-2.5 mt-3 pt-3 border-t border-neutral-100">
          {list.map((job: any) => {
            const dur = fmtDuration(job.started_at, job.completed_at ?? job.finished_at)
            const meta = job.metadata ?? {}
            const isGemini = meta.collector === 'gemini-search-grounding'
            const signalsCount = meta.signals_count ?? job.signals_count
            const groundingSources = meta.grounding_sources
            const analysesCount = meta.analyses_generated
            const isDone = job.status === 'done' || job.status === 'completed'

            return (
              <div key={job.id} className="text-xs border-b border-neutral-50 pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isDone               ? 'bg-green-500' :
                    job.status === 'running' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <span className="text-neutral-600 font-medium">
                    {isGemini ? 'Gemini Collector' : `Agent ${job.agent_number}`}
                  </span>
                  {signalsCount != null && (
                    <span className="text-neutral-400">{signalsCount} signaux</span>
                  )}
                  <span className={`badge text-[9px] ml-auto ${
                    isDone               ? 'badge-green' :
                    job.status === 'running' ? 'badge-amber' : 'badge-red'
                  }`}>
                    {isDone ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Erreur'}
                  </span>
                </div>
                {dur && (
                  <div className="text-[10px] text-neutral-400 mt-0.5 pl-3.5">
                    {dur} · {fmtDate(job.started_at)}
                  </div>
                )}
                {isGemini && isDone && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-3.5">
                    <span className="flex items-center gap-0.5 text-[9px] bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-blue-700">
                      <Sparkles size={8} /> Gemini Search
                    </span>
                    {signalsCount != null && (
                      <span className="flex items-center gap-0.5 text-[9px] bg-green-50 border border-green-100 px-1.5 py-0.5 rounded text-green-700">
                        <Zap size={8} /> {signalsCount} signaux
                      </span>
                    )}
                    {groundingSources != null && (
                      <span className="flex items-center gap-0.5 text-[9px] bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">
                        <FileSearch size={8} /> {groundingSources} sources
                      </span>
                    )}
                    {analysesCount != null && (
                      <span className="flex items-center gap-0.5 text-[9px] bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded text-purple-700">
                        <BrainCircuit size={8} /> {analysesCount} analyses
                      </span>
                    )}
                  </div>
                )}
                {/* Legacy breakdown for old jobs */}
                {!isGemini && meta.breakdown_agents && job.agent_number === 1 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-3.5">
                    {Object.entries(meta.breakdown_agents as Record<string, number>).map(([key, val]) => (
                      <span key={key} title={key}
                        className="flex items-center gap-0.5 text-[9px] bg-neutral-50 border border-neutral-200 px-1.5 py-0.5 rounded text-neutral-600">
                        {key.replace(/_/g, ' ')}: {val as number}
                      </span>
                    ))}
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
