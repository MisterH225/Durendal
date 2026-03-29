'use client'

import { useState, useEffect } from 'react'
import {
  X, Building2, MapPin, Globe, Linkedin, ExternalLink, ChevronDown,
  ThumbsUp, ThumbsDown, Clock, Mail, MessageSquare, Send,
  Loader2, Copy, Check, BarChart3, User, Calendar, AlertCircle, Zap,
} from 'lucide-react'

interface Props {
  opportunityId: string
  onClose: () => void
  onStatusChange: (oppId: string, newStatus: string) => void
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'qualified', label: 'Qualifié' },
  { value: 'proposal', label: 'Proposition' },
  { value: 'negotiation', label: 'Négociation' },
  { value: 'won', label: 'Gagné' },
  { value: 'lost', label: 'Perdu' },
  { value: 'dismissed', label: 'Écarté' },
]

const FEEDBACK_OPTIONS = [
  { type: 'good_fit', label: 'Bon lead', icon: ThumbsUp, color: 'text-green-600 bg-green-50 border-green-200 hover:bg-green-100' },
  { type: 'bad_fit', label: 'Hors cible', icon: ThumbsDown, color: 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100' },
  { type: 'too_early', label: 'Trop tôt', icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' },
]

function ScoreRow({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-neutral-500 w-24 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] font-bold text-neutral-700 w-8 text-right">{score}</span>
    </div>
  )
}

export default function OpportunityDetail({ opportunityId, onClose, onStatusChange }: Props) {
  const [opp, setOpp] = useState<any>(null)
  const [signals, setSignals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'overview' | 'scoring' | 'signals' | 'contacts' | 'message'>('overview')
  const [msgFormat, setMsgFormat] = useState<'email' | 'whatsapp' | 'linkedin'>('email')
  const [generatedMsg, setGeneratedMsg] = useState<any>(null)
  const [generatingMsg, setGeneratingMsg] = useState(false)
  const [copied, setCopied] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/opportunities/${opportunityId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setOpp(data.opportunity)
        setSignals(data.signals || [])
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [opportunityId])

  async function handleStatusChange(newStatus: string) {
    await fetch(`/api/opportunities/${opportunityId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, _previousStatus: opp?.status }),
    })
    setOpp((prev: any) => prev ? { ...prev, status: newStatus } : prev)
    onStatusChange(opportunityId, newStatus)
  }

  async function handleFeedback(type: string) {
    await fetch(`/api/opportunities/${opportunityId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedbackType: type }),
    })
    setFeedbackSent(type)
    setTimeout(() => setFeedbackSent(''), 2000)
  }

  async function handleGenerateMessage() {
    setGeneratingMsg(true)
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/generate-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: msgFormat }),
      })
      const data = await res.json()
      setGeneratedMsg(data.message)
    } catch { /* silencieux */ }
    finally { setGeneratingMsg(false) }
  }

  function copyMessage() {
    if (!generatedMsg) return
    const text = generatedMsg.subject ? `Objet: ${generatedMsg.subject}\n\n${generatedMsg.body}` : generatedMsg.body
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const company = opp?.companies
  const watch = opp?.watches
  const contacts = opp?.contact_candidates || []
  const feedbacks = opp?.opportunity_feedback || []
  const breakdown = opp?.score_breakdown

  const TABS = [
    { key: 'overview', label: 'Résumé' },
    { key: 'scoring', label: 'Score' },
    { key: 'signals', label: `Signaux (${signals.length})` },
    { key: 'contacts', label: `Contacts (${contacts.length})` },
    { key: 'message', label: 'Message' },
  ] as const

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {company?.logo_url ? (
              <img src={company.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-white border border-neutral-200 flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
                <Building2 size={14} className="text-blue-500" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-bold text-neutral-900 truncate">{company?.name || 'Chargement...'}</div>
              <div className="text-[10px] text-neutral-400">{[company?.sector, company?.country].filter(Boolean).join(' · ')}</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400">
            <X size={16} />
          </button>
        </div>

        {loading && (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-neutral-400" /></div>
        )}

        {error && (
          <div className="p-4 text-xs text-red-700 bg-red-50 flex items-center gap-2"><AlertCircle size={14} /> {error}</div>
        )}

        {!loading && opp && (
          <>
            {/* Score + actions rapides */}
            <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-3 flex-shrink-0">
              <div className="text-center">
                <div className="text-2xl font-black text-neutral-900">{opp.total_score}</div>
                <div className="text-[9px] text-neutral-400 font-semibold uppercase">Score</div>
              </div>
              <div className="h-8 w-px bg-neutral-200" />
              {/* Status */}
              <select
                value={opp.status}
                onChange={e => handleStatusChange(e.target.value)}
                className="input py-1 text-[11px] w-auto"
              >
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <div className="flex gap-1 ml-auto">
                {FEEDBACK_OPTIONS.map(f => (
                  <button key={f.type} onClick={() => handleFeedback(f.type)} title={f.label}
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                      feedbackSent === f.type ? 'ring-2 ring-blue-400' : ''
                    } ${f.color}`}>
                    <f.icon size={13} />
                  </button>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-200 px-4 gap-1 flex-shrink-0 overflow-x-auto">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-3 py-2 text-[11px] font-medium border-b-2 transition-all whitespace-nowrap ${
                    tab === t.key ? 'border-blue-700 text-blue-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {tab === 'overview' && (
                <>
                  {/* Summary */}
                  <div>
                    <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Résumé IA</h4>
                    <p className="text-xs text-neutral-700 leading-relaxed">{opp.summary || 'Aucun résumé disponible.'}</p>
                  </div>

                  {/* Angle d'approche */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <h4 className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">Angle d'approche recommandé</h4>
                    <p className="text-xs text-blue-800">{opp.recommended_angle || '—'}</p>
                  </div>

                  {/* Infos entreprise */}
                  <div>
                    <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Entreprise</h4>
                    <div className="space-y-1.5 text-xs text-neutral-600">
                      {company?.website && (
                        <div className="flex items-center gap-2">
                          <Globe size={12} className="text-neutral-400" />
                          <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate">
                            {company.website.replace('https://', '')}
                          </a>
                        </div>
                      )}
                      {company?.country && (
                        <div className="flex items-center gap-2"><MapPin size={12} className="text-neutral-400" /> {company.country}</div>
                      )}
                      {company?.employee_range && (
                        <div className="flex items-center gap-2"><User size={12} className="text-neutral-400" /> {company.employee_range} employés</div>
                      )}
                      {company?.linkedin_url && (
                        <div className="flex items-center gap-2">
                          <Linkedin size={12} className="text-neutral-400" />
                          <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">LinkedIn</a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Veille source */}
                  {watch && (
                    <div className="text-xs text-neutral-500">
                      <span className="font-semibold">Veille source :</span> {watch.name}
                    </div>
                  )}
                </>
              )}

              {tab === 'scoring' && breakdown && (
                <>
                  <div>
                    <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                      <BarChart3 size={12} /> Détail du score
                    </h4>
                    <div className="space-y-2.5">
                      <ScoreRow label="Fit (ICP)" score={breakdown.fit?.score ?? 0} color="bg-blue-500" />
                      <ScoreRow label="Intention" score={breakdown.intent?.score ?? 0} color="bg-purple-500" />
                      <ScoreRow label="Récence" score={breakdown.recency?.score ?? 0} color="bg-green-500" />
                      <ScoreRow label="Engagement" score={breakdown.engagement?.score ?? 0} color="bg-amber-500" />
                      <ScoreRow label="Joignabilité" score={breakdown.reachability?.score ?? 0} color="bg-indigo-500" />
                      <ScoreRow label="Pénalité bruit" score={breakdown.noisePenalty?.score ?? 0} color="bg-red-400" />
                    </div>
                    <div className="mt-3 pt-3 border-t border-neutral-200 flex justify-between text-xs">
                      <span className="font-semibold text-neutral-700">Score final</span>
                      <span className="font-black text-lg text-neutral-900">{breakdown.final ?? opp.total_score}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-neutral-400">
                      Confiance : {opp.confidence_score}/100
                    </div>
                  </div>

                  {/* Raisons détaillées */}
                  {['fit', 'intent', 'recency', 'reachability', 'noisePenalty'].map(key => {
                    const sub = breakdown[key]
                    if (!sub?.reasons?.length) return null
                    const labels: Record<string, string> = {
                      fit: 'Fit', intent: 'Intention', recency: 'Récence',
                      reachability: 'Joignabilité', noisePenalty: 'Bruit',
                    }
                    return (
                      <div key={key}>
                        <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1">{labels[key]}</h4>
                        <div className="space-y-0.5">
                          {sub.reasons.map((r: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                              <span className="text-neutral-600">{r.label}</span>
                              <span className={`font-semibold ${r.points >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {r.points > 0 ? '+' : ''}{r.points}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              {tab === 'signals' && (
                <>
                  {signals.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-8">Aucun signal lié.</p>
                  ) : (
                    <div className="space-y-2">
                      {signals.map((as: any) => {
                        const sig = as.signals
                        return (
                          <div key={as.id || sig?.id} className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-neutral-800 line-clamp-2">{sig?.title || sig?.raw_content?.slice(0, 80)}</div>
                                <div className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-2">
                                  {sig?.signal_type && <span className="badge badge-gray text-[9px]">{sig.signal_type}</span>}
                                  <span>{sig?.collected_at ? new Date(sig.collected_at).toLocaleDateString('fr-FR') : '—'}</span>
                                  {sig?.source_name && <span>via {sig.source_name}</span>}
                                </div>
                              </div>
                              {sig?.url && (
                                <a href={sig.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 text-blue-600 hover:text-blue-800">
                                  <ExternalLink size={13} />
                                </a>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {tab === 'contacts' && (
                <>
                  {contacts.length === 0 ? (
                    <div className="text-center py-8">
                      <User size={24} className="text-neutral-300 mx-auto mb-2" />
                      <p className="text-xs text-neutral-500">Aucun contact identifié.</p>
                      <p className="text-[10px] text-neutral-400 mt-1">L'enrichissement de contacts sera disponible prochainement.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((c: any) => (
                        <div key={c.id} className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-xs font-semibold text-neutral-800">{c.full_name}</div>
                              <div className="text-[10px] text-neutral-500">{c.job_title || c.department || '—'}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {c.is_decision_maker && <span className="badge badge-green text-[9px]">Décideur</span>}
                              {c.email && <Mail size={12} className="text-neutral-400" />}
                              {c.linkedin_url && <Linkedin size={12} className="text-neutral-400" />}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === 'message' && (
                <>
                  <div>
                    <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Générer un message</h4>
                    <div className="flex gap-1.5 mb-3">
                      {(['email', 'whatsapp', 'linkedin'] as const).map(f => (
                        <button key={f} onClick={() => setMsgFormat(f)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                            msgFormat === f ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-neutral-600 border-neutral-200'
                          }`}>
                          {f === 'email' ? 'Email' : f === 'whatsapp' ? 'WhatsApp' : 'LinkedIn'}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleGenerateMessage} disabled={generatingMsg}
                      className="btn-primary text-xs flex items-center gap-1.5 w-full justify-center">
                      {generatingMsg ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      {generatingMsg ? 'Génération...' : 'Générer le message'}
                    </button>
                  </div>

                  {generatedMsg && (
                    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 mt-3">
                      {generatedMsg.subject && (
                        <div className="text-xs text-neutral-500 mb-2">
                          <span className="font-semibold">Objet :</span> {generatedMsg.subject}
                        </div>
                      )}
                      <div className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">
                        {generatedMsg.body}
                      </div>
                      <button onClick={copyMessage}
                        className="mt-2 flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:text-blue-800">
                        {copied ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier</>}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Feedbacks existants */}
              {feedbacks.length > 0 && tab === 'overview' && (
                <div>
                  <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Feedbacks</h4>
                  <div className="space-y-1">
                    {feedbacks.map((f: any) => (
                      <div key={f.id} className="text-[11px] text-neutral-600 flex items-center gap-2">
                        <span className="badge badge-gray text-[9px]">{f.feedback_type}</span>
                        {f.comment && <span className="truncate">{f.comment}</span>}
                        <span className="text-neutral-400 ml-auto flex-shrink-0">{new Date(f.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
