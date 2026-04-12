'use client'
import { useState } from 'react'
import { Play, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

interface Props { watchId: string; hasCompanies: boolean }

export default function RunAgentsButton({ watchId, hasCompanies }: Props) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [detail, setDetail] = useState('')

  async function run() {
    setState('running')
    setDetail('')
    try {
      const res = await fetch('/api/agents/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId }),
      })
      const text = await res.text()
      let data: any = {}
      try { data = JSON.parse(text) } catch {
        setState('error')
        setDetail(res.status === 504 || text.includes('FUNCTION_INVOCATION_TIMEOUT')
          ? 'Délai dépassé — actualisez dans 1-2 min.'
          : `Erreur serveur (${res.status})`)
        setTimeout(() => setState('idle'), 8000)
        return
      }
      if (!res.ok || data.error) {
        setState('error')
        setDetail(data.error ?? `Erreur ${res.status}`)
        setTimeout(() => setState('idle'), 6000)
      } else {
        setDetail(`${data.total_signals ?? 0} signaux · ${data.report_ready ? 'Rapport généré ✓' : 'Rapport en attente'}`)
        setState('done')
        setTimeout(() => { setState('idle'); window.location.reload() }, 3000)
      }
    } catch (err: any) {
      setState('error')
      setDetail(err?.message ?? 'Erreur de connexion')
      setTimeout(() => setState('idle'), 6000)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
      <button
        onClick={run}
        disabled={state === 'running'}
        className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all ${
          state === 'done'    ? 'bg-emerald-600 text-white' :
          state === 'error'   ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
          state === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-wait' :
          'bg-blue-600 text-white hover:bg-blue-500'
        }`}
      >
        {state === 'running' ? <Loader2 size={14} className="animate-spin" /> :
         state === 'done'    ? <CheckCircle size={14} /> :
         state === 'error'   ? <AlertTriangle size={14} /> :
                               <Play size={14} />}
        {state === 'running' ? 'Collecte Gemini…' :
         state === 'done'    ? 'Terminé ✓' :
         state === 'error'   ? 'Erreur' :
         'Lancer le scan'}
      </button>
      {detail && (
        <p className={`text-[10px] font-medium ${state === 'error' ? 'text-red-400' : 'text-neutral-500'}`}>{detail}</p>
      )}
      {!hasCompanies && state === 'idle' && (
        <p className="text-[10px] text-amber-400 flex items-center gap-1">
          <AlertTriangle size={9} /> Recherche sectorielle uniquement
        </p>
      )}
      {state === 'running' && (
        <p className="text-[10px] text-neutral-500">Gemini Search Grounding · Extraction · Analyse IA · Rapports</p>
      )}
    </div>
  )
}
