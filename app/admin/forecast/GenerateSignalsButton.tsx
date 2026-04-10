'use client'
import { useState } from 'react'
import { Zap, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

type State = 'idle' | 'running' | 'done' | 'error'

export function GenerateSignalsButton() {
  const [state, setState]     = useState<State>('idle')
  const [result, setResult]   = useState<{ totalInserted: number; message: string } | null>(null)
  const [errMsg, setErrMsg]   = useState('')
  const [elapsed, setElapsed] = useState(0)

  async function handleClick() {
    setState('running')
    setResult(null)
    setErrMsg('')
    setElapsed(0)

    // Tick every second to show elapsed time
    const interval = setInterval(() => setElapsed(s => s + 1), 1_000)

    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET ?? ''
      const url    = secret
        ? `/api/cron/forecast-news?secret=${encodeURIComponent(secret)}`
        : '/api/cron/forecast-news'

      const res  = await fetch(url)
      const json = await res.json()

      clearInterval(interval)

      if (!res.ok || json.error) {
        setState('error')
        setErrMsg(json.error ?? `HTTP ${res.status}`)
        return
      }

      setResult({ totalInserted: json.totalInserted ?? 0, message: json.message ?? '' })
      setState('done')
    } catch (err: any) {
      clearInterval(interval)
      setState('error')
      setErrMsg(err?.message ?? 'Erreur réseau')
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={state === 'running'}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
          state === 'running'
            ? 'bg-amber-100 text-amber-700 cursor-not-allowed'
            : state === 'done'
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : state === 'error'
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {state === 'running' && <Loader2 size={14} className="animate-spin" />}
        {state === 'done'    && <CheckCircle size={14} />}
        {state === 'error'   && <AlertCircle size={14} />}
        {state === 'idle'    && <Zap size={14} />}

        {state === 'idle'    && 'Générer les signaux maintenant'}
        {state === 'running' && `Génération en cours… ${elapsed}s`}
        {state === 'done'    && `${result?.totalInserted ?? 0} signaux insérés ✓`}
        {state === 'error'   && 'Erreur — réessayer'}
      </button>

      {state === 'running' && (
        <p className="text-xs text-neutral-500">
          Gemini analyse {7} canaux actifs via Google Search. Durée estimée : 60-120 secondes.
        </p>
      )}
      {state === 'done' && result && (
        <p className="text-xs text-green-700">{result.message}</p>
      )}
      {state === 'error' && (
        <p className="text-xs text-red-600">{errMsg}</p>
      )}
    </div>
  )
}
