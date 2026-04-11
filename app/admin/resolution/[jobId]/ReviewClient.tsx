'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle, XCircle, AlertTriangle, ExternalLink, ArrowLeft,
  Shield, Clock, FileText, Loader2, Ban, Scale,
} from 'lucide-react'

interface Props {
  job: any
  auditLog: any[]
  disputes: any[]
}

function trustBadge(trust: string) {
  const map: Record<string, { label: string; cls: string }> = {
    authoritative: { label: 'Autoritatif', cls: 'bg-green-100 text-green-800' },
    reliable: { label: 'Fiable', cls: 'bg-blue-100 text-blue-800' },
    indicative: { label: 'Indicatif', cls: 'bg-amber-100 text-amber-800' },
    unverified: { label: 'Non verifie', cls: 'bg-red-100 text-red-800' },
  }
  return map[trust] ?? { label: trust, cls: 'bg-gray-100 text-gray-800' }
}

export default function ReviewClient({ job, auditLog, disputes }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const question = job.forecast_questions
  const profile = job.resolution_profiles
  const proposals = job.resolution_proposals ?? []
  const evidence = job.resolution_evidence ?? []
  const proposal = proposals.find((p: any) => p.status === 'pending') ?? proposals[0]

  async function handleAction(action: string, outcome?: string) {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/resolution/${job.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: notes || undefined, outcome }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult(`Action "${action}" appliquee avec succes.`)
        setTimeout(() => router.push('/admin/resolution'), 1500)
      } else {
        setResult(`Erreur: ${data.error}`)
      }
    } catch {
      setResult('Erreur reseau')
    } finally {
      setLoading(false)
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

      {/* Question header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-600">
            Classe {question?.resolution_class ?? profile?.resolution_class ?? '?'}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
            {profile?.resolution_mode ?? 'assisted'}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-50 text-neutral-500">
            {question?.question_type === 'multi_choice' ? 'Multi-choix' : 'Binaire'}
          </span>
        </div>

        <h1 className="text-lg font-bold text-neutral-900 mb-2">{question?.title}</h1>

        {question?.description && (
          <p className="text-sm text-neutral-600 mb-3">{question.description}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="font-semibold text-neutral-500">Criteres de resolution:</span>
            <p className="text-neutral-800 mt-0.5">{question?.resolution_criteria}</p>
          </div>
          <div>
            <span className="font-semibold text-neutral-500">Source:</span>
            <p className="text-neutral-800 mt-0.5">{question?.resolution_source}</p>
          </div>
          <div>
            <span className="font-semibold text-neutral-500">Fermeture:</span>
            <p className="text-neutral-800 mt-0.5">
              {question?.close_date ? new Date(question.close_date).toLocaleDateString('fr-FR') : '-'}
            </p>
          </div>
          <div>
            <span className="font-semibold text-neutral-500">Previsions:</span>
            <p className="text-neutral-800 mt-0.5">{question?.forecast_count ?? 0} participant(s)</p>
          </div>
        </div>
      </div>

      {/* Proposal */}
      {proposal && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4" />
            Proposition de Resolution
          </h2>

          <div className="flex items-center gap-3 mb-4">
            <div className={`px-4 py-2 rounded-lg text-sm font-bold ${
              proposal.proposed_outcome === 'resolved_yes'
                ? 'bg-green-100 text-green-800'
                : proposal.proposed_outcome === 'resolved_no'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800'
            }`}>
              {proposal.proposed_outcome === 'resolved_yes' ? 'OUI'
                : proposal.proposed_outcome === 'resolved_no' ? 'NON'
                  : proposal.proposed_outcome}
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-neutral-500">Confiance:</span>
                <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      proposal.confidence >= 0.85 ? 'bg-green-500'
                        : proposal.confidence >= 0.6 ? 'bg-amber-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.round(proposal.confidence * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-bold">{Math.round(proposal.confidence * 100)}%</span>
              </div>
            </div>

            {!proposal.source_agreement && (
              <div className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">Sources divergentes</span>
              </div>
            )}
          </div>

          {proposal.rationale && (
            <div className="px-4 py-3 bg-blue-50 rounded-lg mb-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">Analyse</p>
              <p className="text-sm text-blue-800">{proposal.rationale}</p>
            </div>
          )}

          {proposal.evidence_summary && (
            <details className="text-xs text-neutral-600">
              <summary className="cursor-pointer font-medium text-neutral-500 hover:text-neutral-700">
                Resume des preuves
              </summary>
              <pre className="mt-2 whitespace-pre-wrap bg-neutral-50 p-3 rounded-lg text-[11px]">
                {proposal.evidence_summary}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Evidence */}
      {evidence.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Preuves ({evidence.length})
          </h2>
          <div className="space-y-2">
            {evidence
              .filter((e: any) => e.title && e.title !== 'AI Resolution Analysis')
              .slice(0, 10)
              .map((e: any) => (
                <div key={e.id} className="flex items-start gap-3 p-3 bg-neutral-50 rounded-lg">
                  <Shield className="w-4 h-4 mt-0.5 text-neutral-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-medium text-neutral-800 truncate">{e.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${trustBadge(e.source_trust).cls}`}>
                        {trustBadge(e.source_trust).label}
                      </span>
                      {e.supports_outcome && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          e.supports_outcome === 'resolved_yes' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}>
                          {e.supports_outcome === 'resolved_yes' ? 'OUI' : 'NON'}
                        </span>
                      )}
                    </div>
                    {e.extracted_text && (
                      <p className="text-[11px] text-neutral-600 line-clamp-2">{e.extracted_text}</p>
                    )}
                    {e.source_url && (
                      <a
                        href={e.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 mt-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Source
                      </a>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4 sticky bottom-4">
        <h2 className="text-sm font-bold text-neutral-900 mb-3">Actions</h2>

        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optionnel)..."
          rows={2}
          className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex items-center gap-2 flex-wrap">
          {proposal?.proposed_outcome && proposal.proposed_outcome !== 'needs_review' && (
            <button
              onClick={() => handleAction('approve', proposal.proposed_outcome)}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approuver ({proposal.proposed_outcome === 'resolved_yes' ? 'OUI' : 'NON'})
            </button>
          )}

          {/* Manual resolve buttons when no clear proposal */}
          {(!proposal || proposal.proposed_outcome === 'needs_review') && (
            <>
              <button
                onClick={() => handleAction('approve', 'resolved_yes')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Resoudre OUI
              </button>
              <button
                onClick={() => handleAction('approve', 'resolved_no')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Resoudre NON
              </button>
            </>
          )}

          <button
            onClick={() => handleAction('reject')}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4" />
            Rejeter
          </button>

          <button
            onClick={() => handleAction('annul')}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            <Ban className="w-4 h-4" />
            Annuler
          </button>

          <button
            onClick={() => handleAction('escalate')}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
          >
            <AlertTriangle className="w-4 h-4" />
            Escalader
          </button>
        </div>

        {result && (
          <p className={`mt-3 text-sm font-medium ${result.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>
            {result}
          </p>
        )}
      </div>

      {/* Audit log */}
      {auditLog.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Journal d&apos;audit
          </h2>
          <div className="space-y-1.5">
            {auditLog.map((entry: any) => (
              <div key={entry.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-neutral-50 last:border-0">
                <span className="text-neutral-400 w-28 flex-shrink-0">
                  {new Date(entry.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-mono text-[10px]">
                  {entry.action}
                </span>
                <span className="text-neutral-400">{entry.actor_type}</span>
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <span className="text-neutral-500 truncate">
                    {JSON.stringify(entry.details).slice(0, 100)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disputes */}
      {disputes.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-neutral-900 mb-3">Contestations ({disputes.length})</h2>
          {disputes.map((d: any) => (
            <div key={d.id} className="p-3 bg-purple-50 rounded-lg mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-purple-800">{d.status}</span>
                <span className="text-[10px] text-purple-400">
                  {new Date(d.created_at).toLocaleDateString('fr-FR')}
                </span>
              </div>
              <p className="text-xs text-purple-700">{d.reason}</p>
              {d.evidence_url && (
                <a href={d.evidence_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline mt-1 block">
                  Preuve jointe
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
