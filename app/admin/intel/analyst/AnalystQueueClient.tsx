'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Task = {
  id: string
  task_type: string
  status: string
  priority: number
  ref_table: string | null
  ref_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

const STATUS_TABS = [
  { key: 'open', label: 'Ouverts' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'resolved', label: 'Résolus' },
  { key: 'dismissed', label: 'Rejetés' },
  { key: 'all', label: 'Tous' },
] as const

export function AnalystQueueClient({ tasks, initialStatus }: { tasks: Task[]; initialStatus: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function patchStatus(id: string, status: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/intel/analyst-tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error ?? 'Erreur')
        return
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(tab => (
          <a
            key={tab.key}
            href={tab.key === 'all' ? '/admin/intel/analyst' : `/admin/intel/analyst?status=${tab.key}`}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
              initialStatus === tab.key
                ? 'bg-blue-700 text-white border-blue-700'
                : 'bg-white text-neutral-700 border-neutral-200 hover:border-blue-400'
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {!tasks.length ? (
        <p className="text-sm text-neutral-500">Aucune tâche pour ce filtre.</p>
      ) : (
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-600">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Priorité</th>
                <th className="px-3 py-2">Réf.</th>
                <th className="px-3 py-2">Créé</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-medium text-neutral-900">{t.task_type}</td>
                  <td className="px-3 py-2 text-neutral-600">{t.status}</td>
                  <td className="px-3 py-2">{t.priority}</td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {t.ref_table ?? '—'} {t.ref_id ? t.ref_id.slice(0, 8) : ''}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {new Date(t.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.status === 'open' && (
                        <button
                          type="button"
                          disabled={busy === t.id}
                          onClick={() => patchStatus(t.id, 'in_progress')}
                          className="text-[10px] px-2 py-1 rounded bg-neutral-200 hover:bg-neutral-300 disabled:opacity-50"
                        >
                          Prendre
                        </button>
                      )}
                      {(t.status === 'open' || t.status === 'in_progress') && (
                        <>
                          <button
                            type="button"
                            disabled={busy === t.id}
                            onClick={() => patchStatus(t.id, 'resolved')}
                            className="text-[10px] px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Résoudre
                          </button>
                          <button
                            type="button"
                            disabled={busy === t.id}
                            onClick={() => patchStatus(t.id, 'dismissed')}
                            className="text-[10px] px-2 py-1 rounded bg-neutral-500 text-white hover:bg-neutral-400 disabled:opacity-50"
                          >
                            Rejeter
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
