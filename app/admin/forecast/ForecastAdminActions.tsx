'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, CheckCircle, Pencil, Trash2 } from 'lucide-react'

interface Props { questionId: string; status: string }

export function ForecastAdminActions({ questionId, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function triggerAI() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/forecast/questions/${questionId}/ai-forecast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: true }) })
      const j = await res.json()
      alert(res.ok ? 'Job IA mis en file — résultat dans quelques secondes.' : `Erreur : ${j.error}`)
    } finally { setBusy(false) }
  }

  async function deleteQuestion() {
    if (!confirm('Supprimer cette question ? Irréversible.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/forecast/questions/${questionId}`, { method: 'DELETE' })
      if (res.ok) router.refresh()
      else { const j = await res.json(); alert(`Erreur : ${j.error}`) }
    } finally { setBusy(false) }
  }

  async function publishQuestion() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/forecast/questions/${questionId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'open' }) })
      if (res.ok) router.refresh()
      else { const j = await res.json(); alert(`Erreur : ${j.error}`) }
    } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <button onClick={triggerAI} disabled={busy} title="Lancer estimation IA" className="p-1.5 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors disabled:opacity-40"><Bot size={14} /></button>
      {status === 'draft' && <button onClick={publishQuestion} disabled={busy} title="Publier" className="p-1.5 rounded hover:bg-green-50 text-green-500 hover:text-green-700 transition-colors disabled:opacity-40"><CheckCircle size={14} /></button>}
      <a href={`/admin/forecast/questions/${questionId}/edit`} title="Éditer" className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"><Pencil size={14} /></a>
      <button onClick={deleteQuestion} disabled={busy} title="Supprimer" className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"><Trash2 size={14} /></button>
    </div>
  )
}
