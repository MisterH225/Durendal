'use client'
import { useState } from 'react'
import { Play, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

interface Props {
  watchId:     string
  hasCompanies: boolean
}

export default function RunAgentsButton({ watchId, hasCompanies }: Props) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [detail, setDetail] = useState('')

  async function run() {
    setState('running')
    setDetail('')
    try {
      // Agent 1 lance les 5 agents en parallèle ET génère le rapport (Phase 4)
      // Plus besoin d'appeler Agent 2 séparément — il est auto-déclenché.
      const res  = await fetch('/api/agents/scrape', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ watchId }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setState('error')
        setDetail(data.error ?? `Erreur ${res.status}`)
        setTimeout(() => setState('idle'), 5000)
      } else {
        const signals     = data.total_signals ?? 0
        const reportReady = data.report_ready
        setDetail(`${signals} signaux · ${reportReady ? 'Rapport généré ✓' : 'Rapport en attente'}`)
        setState('done')
        setTimeout(() => { setState('idle'); window.location.reload() }, 3000)
      }
    } catch (err: any) {
      setState('error')
      setDetail(err?.message ?? 'Erreur de connexion')
      setTimeout(() => setState('idle'), 5000)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
      <button
        onClick={run}
        disabled={state === 'running'}
        className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-all
          ${state === 'done'    ? 'bg-green-600 text-white' :
            state === 'error'   ? 'bg-red-100 text-red-700 border border-red-200' :
            state === 'running' ? 'bg-amber-100 text-amber-700 border border-amber-200 cursor-wait' :
            'btn-primary'
          }`}
      >
        {state === 'running' ? <Loader2    size={14} className="animate-spin" /> :
         state === 'done'    ? <CheckCircle size={14} /> :
         state === 'error'   ? <AlertTriangle size={14} /> :
                               <Play        size={14} />}
        {state === 'running' ? '5 agents en cours…' :
         state === 'done'    ? 'Terminé ✓' :
         state === 'error'   ? 'Erreur' :
         'Lancer le scan'}
      </button>

      {/* Détails du résultat */}
      {detail && (
        <p className={`text-[10px] font-medium ${state === 'error' ? 'text-red-500' : 'text-neutral-500'}`}>
          {detail}
        </p>
      )}

      {/* Avertissement si pas d'entreprises */}
      {!hasCompanies && state === 'idle' && (
        <p className="text-[10px] text-amber-600 flex items-center gap-1">
          <AlertTriangle size={9} /> Aucune entreprise — recherche sectorielle uniquement
        </p>
      )}

      {/* Description pendant l'exécution */}
      {state === 'running' && (
        <p className="text-[10px] text-neutral-400">
          web_scanner · press_monitor · analyst · deep_research · Deep Research IA
        </p>
      )}
    </div>
  )
}
