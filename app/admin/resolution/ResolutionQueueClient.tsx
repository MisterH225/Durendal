'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle, XCircle, AlertTriangle, Clock, Eye, Loader2 } from 'lucide-react'

interface Props {
  initialJobs: any[]
  counts: { pending: number; needs_review: number; disputed: number; failed: number }
}

const TABS = [
  { key: 'pending', label: 'Propositions', color: 'text-amber-600' },
  { key: 'needs_review', label: 'A traiter', color: 'text-red-600' },
  { key: 'disputed', label: 'Contestées', color: 'text-purple-600' },
  { key: 'failed', label: 'Echecs', color: 'text-gray-500' },
] as const

function confidenceBadge(c: number) {
  if (c >= 0.85) return { label: `${Math.round(c * 100)}%`, cls: 'bg-green-100 text-green-800' }
  if (c >= 0.6) return { label: `${Math.round(c * 100)}%`, cls: 'bg-amber-100 text-amber-800' }
  return { label: `${Math.round(c * 100)}%`, cls: 'bg-red-100 text-red-800' }
}

function outcomeBadge(outcome: string) {
  if (outcome === 'resolved_yes') return { label: 'OUI', cls: 'bg-green-100 text-green-800' }
  if (outcome === 'resolved_no') return { label: 'NON', cls: 'bg-red-100 text-red-800' }
  if (outcome === 'needs_review') return { label: 'A examiner', cls: 'bg-amber-100 text-amber-800' }
  return { label: outcome, cls: 'bg-gray-100 text-gray-800' }
}

export default function ResolutionQueueClient({ initialJobs, counts }: Props) {
  const [activeTab, setActiveTab] = useState<string>('pending')
  const [jobs, setJobs] = useState(initialJobs)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function loadTab(tab: string) {
    setActiveTab(tab)
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/resolution?tab=${tab}`)
      const data = await res.json()
      setJobs(data.jobs ?? [])
    } catch {
      console.error('Failed to load tab')
    } finally {
      setLoading(false)
    }
  }

  async function quickApprove(jobId: string, outcome: string) {
    setActionLoading(jobId)
    try {
      const res = await fetch(`/api/admin/resolution/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', outcome }),
      })
      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId))
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function quickReject(jobId: string) {
    setActionLoading(jobId)
    try {
      const res = await fetch(`/api/admin/resolution/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      })
      if (res.ok) {
        setJobs(prev => prev.filter(j => j.id !== jobId))
      }
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Moteur de Résolution</h1>
          <p className="text-sm text-neutral-500 mt-1">
            File de résolution des questions forecast
          </p>
        </div>
        <Link
          href="/admin/resolution/disputes"
          className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Contestations ({counts.disputed})
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-neutral-200 rounded-lg p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => loadTab(tab.key)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white shadow text-neutral-900'
                : 'text-neutral-600 hover:bg-white/50'
            }`}
          >
            {tab.label}
            {(counts as any)[tab.key] > 0 && (
              <span className={`ml-2 text-xs font-bold ${tab.color}`}>
                {(counts as any)[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Job list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-neutral-400">
          <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Aucun élément dans cette file</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => {
            const q = job.forecast_questions
            const proposals = job.resolution_proposals ?? []
            const proposal = proposals.find((p: any) => p.status === 'pending') ?? proposals[0]
            const isLoading = actionLoading === job.id

            return (
              <div
                key={job.id}
                className="bg-white border border-neutral-200 rounded-xl p-4 hover:border-neutral-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        Classe {q?.resolution_class ?? 'B'}
                      </span>
                      <span className="text-[10px] text-neutral-300">|</span>
                      <span className="text-[10px] text-neutral-400">
                        {q?.question_type === 'multi_choice' ? 'Multi-choix' : 'Binaire'}
                      </span>
                      {q?.forecast_count > 0 && (
                        <>
                          <span className="text-[10px] text-neutral-300">|</span>
                          <span className="text-[10px] text-neutral-400">
                            {q.forecast_count} prevision(s)
                          </span>
                        </>
                      )}
                    </div>

                    <h3 className="text-sm font-semibold text-neutral-900 truncate">
                      {q?.title ?? 'Question inconnue'}
                    </h3>

                    <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                      {q?.resolution_criteria}
                    </p>

                    {proposal?.rationale && (
                      <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg">
                        <p className="text-xs text-blue-700 font-medium mb-1">Analyse IA</p>
                        <p className="text-xs text-blue-600 line-clamp-3">{proposal.rationale}</p>
                      </div>
                    )}

                    {proposal && !proposal.source_agreement && (
                      <div className="mt-2 flex items-center gap-1 text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="text-[10px] font-medium">Sources en desaccord</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {proposal && (
                      <>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${outcomeBadge(proposal.proposed_outcome).cls}`}>
                          {outcomeBadge(proposal.proposed_outcome).label}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${confidenceBadge(proposal.confidence).cls}`}>
                          Confiance: {confidenceBadge(proposal.confidence).label}
                        </span>
                      </>
                    )}
                    <span className="text-[10px] text-neutral-400">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(job.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-neutral-100">
                  {proposal?.proposed_outcome && proposal.proposed_outcome !== 'needs_review' && (
                    <button
                      onClick={() => quickApprove(job.id, proposal.proposed_outcome)}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Approuver
                    </button>
                  )}
                  <button
                    onClick={() => quickReject(job.id)}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-3 h-3" />
                    Rejeter
                  </button>
                  <Link
                    href={`/admin/resolution/${job.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors ml-auto"
                  >
                    <Eye className="w-3 h-3" />
                    Details
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
