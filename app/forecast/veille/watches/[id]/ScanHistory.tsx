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

export default function ScanHistory({ jobs }: { jobs: any[] }) {
  const [open, setOpen] = useState(false)
  const list = Array.isArray(jobs) ? jobs : []
  if (list.length === 0) return null

  const lastJob = list[0]
  const lastDate = fmtDate(lastJob?.started_at)
  const doneCount = list.filter((j: any) => j.status === 'done' || j.status === 'completed').length

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between group">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">Derniers scans</h3>
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
            {list.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!open && <span className="text-[10px] text-neutral-500">{lastDate} · {doneCount}/{list.length} ok</span>}
          <div className="w-5 h-5 rounded-full bg-neutral-800 group-hover:bg-neutral-700 flex items-center justify-center transition-colors flex-shrink-0">
            {open ? <ChevronUp size={11} className="text-neutral-400" /> : <ChevronDown size={11} className="text-neutral-400" />}
          </div>
        </div>
      </button>

      {open && (
        <div className="space-y-2.5 mt-3 pt-3 border-t border-neutral-800">
          {list.map((job: any) => {
            const dur = fmtDuration(job.started_at, job.completed_at ?? job.finished_at)
            const meta = job.metadata ?? {}
            const isGemini = meta.collector === 'gemini-search-grounding'
            const signalsCount = meta.signals_count ?? job.signals_count
            const groundingSources = meta.grounding_sources
            const analysesCount = meta.analyses_generated
            const isDone = job.status === 'done' || job.status === 'completed'

            return (
              <div key={job.id} className="text-xs border-b border-neutral-800/50 pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isDone ? 'bg-emerald-400' : job.status === 'running' ? 'bg-amber-400' : 'bg-red-400'
                  }`} />
                  <span className="text-neutral-300 font-medium">
                    {isGemini ? 'Gemini Collector' : `Agent ${job.agent_number}`}
                  </span>
                  {signalsCount != null && <span className="text-neutral-500">{signalsCount} signaux</span>}
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ml-auto border ${
                    isDone ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                    job.status === 'running' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {isDone ? 'Terminé' : job.status === 'running' ? 'En cours' : 'Erreur'}
                  </span>
                </div>
                {dur && <div className="text-[10px] text-neutral-600 mt-0.5 pl-3.5">{dur} · {fmtDate(job.started_at)}</div>}
                {isGemini && isDone && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-3.5">
                    <span className="flex items-center gap-0.5 text-[9px] bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded text-blue-400">
                      <Sparkles size={8} /> Gemini Search
                    </span>
                    {signalsCount != null && (
                      <span className="flex items-center gap-0.5 text-[9px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-emerald-400">
                        <Zap size={8} /> {signalsCount} signaux
                      </span>
                    )}
                    {groundingSources != null && (
                      <span className="flex items-center gap-0.5 text-[9px] bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded text-neutral-400">
                        <FileSearch size={8} /> {groundingSources} sources
                      </span>
                    )}
                    {analysesCount != null && (
                      <span className="flex items-center gap-0.5 text-[9px] bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded text-violet-400">
                        <BrainCircuit size={8} /> {analysesCount} analyses
                      </span>
                    )}
                  </div>
                )}
                {!isGemini && meta.breakdown_agents && job.agent_number === 1 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-3.5">
                    {Object.entries(meta.breakdown_agents as Record<string, number>).map(([key, val]) => (
                      <span key={key} className="flex items-center gap-0.5 text-[9px] bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded text-neutral-500">
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
