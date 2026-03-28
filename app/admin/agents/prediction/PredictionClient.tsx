'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Bot, Play, Pause, Save, AlertCircle, CheckCircle2,
  Clock, Loader2, Activity, ChevronDown, ChevronUp, Zap,
  Trash2, Eye, Wifi, WifiOff, Power, FileText, Settings2,
  BrainCircuit, Target, Shield, Crosshair,
} from 'lucide-react'

interface AgentConfig {
  id: string
  name: string
  description: string
  status: 'active' | 'paused' | 'disabled'
  prompt: string
  model: string
  config: Record<string, any>
  last_run_at: string | null
  runs_count: number
  errors_count: number
}

interface AgentRun {
  id: string
  status: string
  trigger: string
  sources_processed: number
  sources_updated: number
  duration_ms: number | null
  error_message: string | null
  metadata: Record<string, any>
  started_at: string
  completed_at: string | null
}

interface RecentReport {
  id: string
  title: string
  watch_id: string
  created_at: string
  summary: string | null
  watches: { name: string } | null
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(ms: number | null) {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function PredictionClient() {
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])
  const [stats, setStats] = useState({ totalPredictions: 0, totalJobs: 0, miroFishJobs: 0 })
  const [miroFishStatus, setMiroFishStatus] = useState<'connected' | 'disconnected' | 'disabled'>('disabled')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [showPrompt, setShowPrompt] = useState(false)
  const [showMiroFish, setShowMiroFish] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [editModel, setEditModel] = useState('gemini-2.5-flash')

  const [mfEnabled, setMfEnabled] = useState(false)
  const [mfUrl, setMfUrl] = useState('')
  const [mfApiKey, setMfApiKey] = useState('')
  const [autoTrigger, setAutoTrigger] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agents/prediction')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAgent(data.agent)
      setRuns(data.runs ?? [])
      setRecentReports(data.recentReports ?? [])
      setStats(data.stats)
      setMiroFishStatus(data.miroFishStatus)
      if (data.agent) {
        setEditPrompt(data.agent.prompt)
        setEditModel(data.agent.model)
        const cfg = data.agent.config ?? {}
        setMfEnabled(cfg.mirofish_enabled ?? false)
        setMfUrl(cfg.mirofish_url ?? '')
        setMfApiKey(cfg.mirofish_api_key ?? '')
        setAutoTrigger(cfg.auto_trigger !== false)
      }
    } catch {
      setMsg({ type: 'err', text: 'Erreur chargement config agent' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function toggleStatus() {
    if (!agent) return
    const next = agent.status === 'active' ? 'paused' : 'active'
    try {
      const res = await fetch('/api/admin/agents/prediction', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error()
      const { agent: updated } = await res.json()
      setAgent(updated)
      setMsg({ type: 'ok', text: next === 'active' ? 'Agent activé' : 'Agent mis en pause' })
    } catch {
      setMsg({ type: 'err', text: 'Erreur changement statut' })
    }
    setTimeout(() => setMsg(null), 3000)
  }

  async function saveConfig() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/agents/prediction', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editPrompt,
          model: editModel,
          config: {
            mirofish_enabled: mfEnabled,
            mirofish_url: mfUrl,
            mirofish_api_key: mfApiKey,
            auto_trigger: autoTrigger,
          },
        }),
      })
      if (!res.ok) throw new Error()
      const { agent: updated } = await res.json()
      setAgent(updated)
      setMsg({ type: 'ok', text: 'Configuration sauvegardée' })
      fetchData()
    } catch {
      setMsg({ type: 'err', text: 'Erreur sauvegarde' })
    } finally {
      setSaving(false)
    }
    setTimeout(() => setMsg(null), 3000)
  }

  async function deleteAgent() {
    if (!confirm('Supprimer définitivement le moteur de prédiction et tout son historique ?')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/agents/prediction', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setAgent(null)
      setRuns([])
      setMsg({ type: 'ok', text: 'Agent supprimé' })
    } catch {
      setMsg({ type: 'err', text: 'Erreur suppression' })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-neutral-300" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="max-w-3xl">
        <div className="card-lg text-center py-16">
          <BrainCircuit size={40} className="text-neutral-200 mx-auto mb-4" />
          <h3 className="text-base font-bold text-neutral-900 mb-2">Moteur non configuré</h3>
          <p className="text-xs text-neutral-500 mb-6">
            Le moteur de prédiction n&apos;existe pas encore. Exécutez la migration SQL 009 pour le créer.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <BrainCircuit size={20} className="text-indigo-600" />
            {agent.name}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge text-xs ${
            agent.status === 'active' ? 'badge-green' : agent.status === 'paused' ? 'badge-amber' : 'badge-red'
          }`}>
            {agent.status === 'active' ? 'Actif' : agent.status === 'paused' ? 'En pause' : 'Désactivé'}
          </span>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 rounded-lg p-3 mb-4 text-xs ${
          msg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {msg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Prédictions', value: stats.totalPredictions, icon: Target, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Jobs total', value: stats.totalJobs, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Via MiroFish', value: stats.miroFishJobs, icon: BrainCircuit, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Exécutions', value: agent.runs_count, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-neutral-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <div className="text-2xl font-bold text-neutral-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Module MiroFish */}
      <div className={`card-lg mb-6 border-l-4 ${
        miroFishStatus === 'connected' ? 'border-green-400' :
        miroFishStatus === 'disconnected' ? 'border-red-400' : 'border-neutral-300'
      }`}>
        <button
          onClick={() => setShowMiroFish(!showMiroFish)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              miroFishStatus === 'connected' ? 'bg-green-50' :
              miroFishStatus === 'disconnected' ? 'bg-red-50' : 'bg-neutral-100'
            }`}>
              {miroFishStatus === 'connected'
                ? <Wifi size={16} className="text-green-600" />
                : miroFishStatus === 'disconnected'
                ? <WifiOff size={16} className="text-red-500" />
                : <Power size={16} className="text-neutral-400" />
              }
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-neutral-900">Module MiroFish</h3>
              <p className="text-[10px] text-neutral-500">
                {miroFishStatus === 'connected' ? 'Connecté et opérationnel' :
                 miroFishStatus === 'disconnected' ? 'Configuré mais injoignable' :
                 'Non activé — les prédictions utilisent Gemini seul'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge text-[10px] ${
              miroFishStatus === 'connected' ? 'badge-green' :
              miroFishStatus === 'disconnected' ? 'badge-red' : 'badge-gray'
            }`}>
              {miroFishStatus === 'connected' ? 'Connecté' :
               miroFishStatus === 'disconnected' ? 'Déconnecté' : 'Désactivé'}
            </span>
            {showMiroFish ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
          </div>
        </button>

        {showMiroFish && (
          <div className="mt-4 pt-4 border-t border-neutral-100 space-y-4">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mfEnabled}
                  onChange={e => setMfEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
              <span className="text-xs font-medium text-neutral-700">Activer MiroFish</span>
            </div>
            <div>
              <label className="label">URL du serveur MiroFish</label>
              <input
                type="url"
                className="input"
                placeholder="http://localhost:5001"
                value={mfUrl}
                onChange={e => setMfUrl(e.target.value)}
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                GitHub : github.com/666ghj/MiroFish — Docker : port 5001
              </p>
            </div>
            <div>
              <label className="label">Clé API MiroFish (optionnel)</label>
              <input
                type="password"
                className="input"
                placeholder="Laisser vide si pas d'authentification"
                value={mfApiKey}
                onChange={e => setMfApiKey(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTrigger}
                  onChange={e => setAutoTrigger(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
              </label>
              <span className="text-xs font-medium text-neutral-700">Déclencher automatiquement après Agent 4</span>
            </div>
          </div>
        )}
      </div>

      {/* Axes de prédiction */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {[
          { icon: Crosshair, label: 'Prochain mouvement', desc: 'Anticipe les actions de chaque entreprise', color: 'text-red-600', bg: 'bg-red-50' },
          { icon: Target, label: 'Intention stratégique', desc: 'Déduit les objectifs sous-jacents', color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { icon: Shield, label: 'Contre-positionnement', desc: 'Recommandations défensives et offensives', color: 'text-green-600', bg: 'bg-green-50' },
        ].map(({ icon: Icon, label, desc, color, bg }) => (
          <div key={label} className="card-lg">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={15} className={color} />
            </div>
            <div className="text-xs font-bold text-neutral-900">{label}</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="card-lg mb-6">
        <h3 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <Settings2 size={14} />
          Contrôles
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={toggleStatus}
            className={`text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg border transition-colors font-medium ${
              agent.status === 'active'
                ? 'border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                : 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
            }`}
          >
            {agent.status === 'active' ? <><Pause size={13} /> Mettre en pause</> : <><Zap size={13} /> Activer</>}
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Sauvegarder
          </button>
          <button
            onClick={deleteAgent}
            disabled={deleting}
            className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors font-medium disabled:opacity-50"
          >
            <Trash2 size={13} /> Supprimer
          </button>
        </div>
      </div>

      {/* Prompt Editor */}
      <div className="card-lg mb-6">
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex items-center justify-between w-full"
        >
          <h3 className="text-sm font-bold text-neutral-900">Prompt de l&apos;agent</h3>
          {showPrompt ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
        </button>

        {showPrompt && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="label">Modèle LLM</label>
              <select className="input" value={editModel} onChange={e => setEditModel(e.target.value)}>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (recommandé)</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (économique)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (legacy)</option>
              </select>
            </div>
            <div>
              <label className="label">Prompt système</label>
              <textarea
                className="input font-mono text-xs resize-none"
                rows={18}
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Rapports récents */}
      {recentReports.length > 0 && (
        <div className="card-lg mb-6">
          <h3 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <FileText size={14} />
            Dernières prédictions générées
          </h3>
          <div className="space-y-2">
            {recentReports.map(r => (
              <Link
                key={r.id}
                href={`/veilles/${r.watch_id}/reports/${r.id}`}
                className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-indigo-300 hover:bg-neutral-100/80 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0">
                  <BrainCircuit size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-neutral-900 truncate group-hover:text-indigo-800">
                    {r.title}
                  </div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">
                    {(r.watches as any)?.name ?? 'Veille'} · {fmtDate(r.created_at)}
                  </div>
                </div>
                <Eye size={12} className="text-neutral-300 group-hover:text-indigo-500 flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Historique des runs */}
      <div className="card-lg">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={14} className="text-neutral-500" />
          <h3 className="text-sm font-bold text-neutral-900">Historique des exécutions</h3>
        </div>

        {runs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  {['Statut', 'MiroFish', 'Entreprises', 'Tokens', 'Durée', 'Date'].map(h => (
                    <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <span className={`badge text-[10px] ${
                        run.status === 'done' ? 'badge-green' : run.status === 'running' ? 'badge-amber' : 'badge-red'
                      }`}>
                        {run.status === 'done' ? 'OK' : run.status === 'running' ? 'En cours' : 'Erreur'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {run.metadata?.mirofish_used
                        ? <span className="badge badge-purple text-[10px]">Oui</span>
                        : <span className="badge badge-gray text-[10px]">Non</span>
                      }
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 font-medium">{run.metadata?.companies_predicted ?? '—'}</td>
                    <td className="py-2.5 px-3 text-neutral-500">{run.metadata?.tokens_used?.toLocaleString() ?? '—'}</td>
                    <td className="py-2.5 px-3 text-neutral-500">{fmtDuration(run.duration_ms)}</td>
                    <td className="py-2.5 px-3 text-neutral-500">{fmtDate(run.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center">
            <Bot size={28} className="text-neutral-200 mx-auto mb-3" />
            <p className="text-sm text-neutral-400">Aucune exécution pour l&apos;instant.</p>
            <p className="text-[10px] text-neutral-300 mt-1">Les prédictions seront générées automatiquement après chaque scan.</p>
          </div>
        )}
      </div>
    </div>
  )
}
