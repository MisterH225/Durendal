'use client'
import { useState } from 'react'
import { Play, Loader2 } from 'lucide-react'

export default function RunAgentsButton({ watchId }: { watchId: string }) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  async function run() {
    setRunning(true)
    try {
      // Run agent 1 then 2 sequentially
      await fetch('/api/agents/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId }),
      })
      await fetch('/api/agents/synthesize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId }),
      })
      setDone(true)
      setTimeout(() => { setDone(false); window.location.reload() }, 2000)
    } catch (err) {
      console.error(err)
    } finally {
      setRunning(false)
    }
  }

  return (
    <button onClick={run} disabled={running}
      className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-all flex-shrink-0
        ${done ? 'bg-green-600 text-white' : running ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'btn-primary'}`}>
      {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
      {done ? 'Terminé ✓' : running ? 'Scan en cours...' : 'Lancer le scan'}
    </button>
  )
}
