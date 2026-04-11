'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'

interface Props { eventId: string; title: string }

export function EventActions({ eventId, title }: Props) {
  const [busy, setBusy] = useState(false)

  async function deleteEvent() {
    setBusy(true)
    try {
      const checkRes = await fetch(`/api/admin/forecast/events/${eventId}`, { method: 'DELETE' })
      const checkData = await checkRes.json()

      if (checkData.warning) {
        const ok = confirm(
          `⚠️ ${checkData.message}\n\nVoulez-vous vraiment supprimer l'événement "${title}" et ses ${checkData.linkedQuestions} question(s) ?`
        )
        if (!ok) return

        const confirmRes = await fetch(`/api/admin/forecast/events/${eventId}?confirm=true`, { method: 'DELETE' })
        const confirmData = await confirmRes.json()
        if (confirmRes.ok && confirmData.ok) {
          window.location.reload()
        } else {
          alert(`Erreur : ${confirmData.error ?? 'Erreur inconnue'}`)
        }
      } else if (checkRes.ok && checkData.ok) {
        window.location.reload()
      } else {
        alert(`Erreur : ${checkData.error ?? 'Erreur inconnue'}`)
      }
    } catch (err) {
      alert(`Erreur réseau : ${err}`)
    } finally { setBusy(false) }
  }

  return (
    <button
      onClick={deleteEvent}
      disabled={busy}
      title="Supprimer l'événement"
      className="p-1.5 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors disabled:opacity-40"
    >
      <Trash2 size={14} />
    </button>
  )
}
