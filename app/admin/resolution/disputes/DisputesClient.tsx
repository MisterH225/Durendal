'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react'

interface Props {
  initialDisputes: any[]
}

export default function DisputesClient({ initialDisputes }: Props) {
  const [disputes, setDisputes] = useState(initialDisputes)
  const [loading, setLoading] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  async function handleAction(disputeId: string, action: 'uphold' | 'reject') {
    setLoading(disputeId)
    try {
      const res = await fetch('/api/admin/resolution/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disputeId, action, notes: notes[disputeId] }),
      })
      if (res.ok) {
        setDisputes(prev => prev.filter(d => d.id !== disputeId))
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/resolution"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour a la file
      </Link>

      <h1 className="text-xl font-bold text-neutral-900 mb-1">Contestations</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Revue des contestations de resolution soumises par les utilisateurs
      </p>

      {disputes.length === 0 ? (
        <div className="text-center py-20 text-neutral-400">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Aucune contestation en attente</p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((d: any) => {
            const q = d.forecast_questions
            const isLoading = loading === d.id

            return (
              <div key={d.id} className="bg-white border border-neutral-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-bold uppercase tracking-wider text-purple-600">{d.status}</span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(d.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-neutral-900">{q?.title ?? 'Question inconnue'}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">{q?.resolution_criteria}</p>
                  </div>
                </div>

                <div className="px-4 py-3 bg-purple-50 rounded-lg mb-3">
                  <p className="text-xs font-semibold text-purple-700 mb-1">Raison de la contestation</p>
                  <p className="text-sm text-purple-800">{d.reason}</p>
                  {d.evidence_url && (
                    <a
                      href={d.evidence_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline mt-2 block"
                    >
                      Voir la preuve jointe
                    </a>
                  )}
                </div>

                <textarea
                  value={notes[d.id] ?? ''}
                  onChange={e => setNotes(prev => ({ ...prev, [d.id]: e.target.value }))}
                  placeholder="Notes de decision (optionnel)..."
                  rows={2}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(d.id, 'uphold')}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Accepter (annuler resolution)
                  </button>
                  <button
                    onClick={() => handleAction(d.id, 'reject')}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" />
                    Rejeter la contestation
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
