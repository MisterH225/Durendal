'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bot, Play, Pause, RefreshCw, Trash2, Save, AlertCircle, CheckCircle2,
  Clock, Loader2, Activity, ChevronDown, ChevronUp, Zap, Globe, Copy, ExternalLink,
} from 'lucide-react'

interface AgentConfig {
  id: string
  name: string
  description: string
  status: 'active' | 'paused' | 'disabled'
  prompt: string
  model: string
  config: Record<string, unknown>
  last_run_at: string | null
  runs_count: number
  errors_count: number
  created_at: string
  updated_at: string
}

interface AgentRun {
  id: string
  status: string
  trigger: string
  sources_processed: number
  sources_updated: number
  duration_ms: number | null
  error_message: string | null
  started_at: string
  completed_at: string | null
}

interface DuplicateGroup {
  canonicalDomain: string
  sources: { id: string; name: string; url: string; is_active: boolean; created_at: string }[]
}

interface Stats {
  totalSources: number
  categorized: number
  pending: number
  duplicates: number
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

export default function CategorizerClient() {
  const [agent, setAgent] = useState<AgentConfig | null>(null)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [stats, setStats] = useState<Stats>({ totalSources: 0, categorized: 0, pending: 0, duplicates: 0 })
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const [editPrompt, setEditPrompt] = useState('')
  const [editModel, setEditModel] = useState('gemini-2.5-flash')
  const [showPrompt, setShowPrompt] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [runLogs, setRunLogs] = useState<string[]>([])

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agents/categorizer')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAgent(data.agent)
      setRuns(data.runs ?? [])
      setStats(data.stats)
      setDuplicateGroups(data.duplicateGroups ?? [])
      if (data.agent) {
        setEditPrompt(data.agent.prompt)
        setEditModel(data.agent.model)
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
      const res = await fetch('/api/admin/agents/categorizer', {
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

  async function savePrompt() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/agents/categorizer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: editPrompt, model: editModel }),
      })
      if (!res.ok) throw new Error()
      const { agent: updated } = await res.json()
      setAgent(updated)
      setMsg({ type: 'ok', text: 'Prompt et modèle sauvegardés' })
    } catch {
      setMsg({ type: 'err', text: 'Erreur sauvegarde' })
    } finally {
      setSaving(false)
    }
    setTimeout(() => setMsg(null), 3000)
  }

  async function runNow(forceAll = false) {
    setRunning(true)
    setRunLogs([])
    setShowLogs(true)
    try {
      const res = await fetch('/api/admin/agents/categorizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceAll }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setRunLogs(data.logs ?? [])
      const parts = [`${data.updated}/${data.processed} catégorisées`]
      if (data.duplicatesDeactivated > 0) parts.push(`${data.duplicatesDeactivated} doublons nettoyés`)
      setMsg({ type: 'ok', text: parts.join(' · ') })
      fetchData()
    } catch {
      setMsg({ type: 'err', text: "Erreur lors de l'exécution" })
    } finally {
      setRunning(false)
    }
    setTimeout(() => setMsg(null), 5000)
  }

  async function deleteAgent() {
    if (!confirm('Supprimer définitivement l\'agent catégoriseur et tout son historique ?')) return
    setDeleting(true)
    try {
      const res = await fetch('/api/admin/agents/categorizer', { method: 'DELETE' })
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
          <Bot size={40} className="text-neutral-200 mx-auto mb-4" />
          <h3 className="text-base font-bold text-neutral-900 mb-2">Agent non configuré</h3>
          <p className="text-xs text-neutral-500 mb-6">
            L&apos;agent catégoriseur n&apos;existe pas encore. Exécutez la migration SQL pour le créer.
          </p>
        </div>
      </div>
    )
  }

  const progressPct = stats.totalSources > 0
    ? Math.round((stats.categorized / stats.totalSources) * 100)
    : 0

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <Bot size={20} className="text-teal-600" />
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

      {/* Message toast */}
      {msg && (
        <div className={`flex items-center gap-2 rounded-lg p-3 mb-4 text-xs ${
          msg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {msg.text}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Sources totales', value: stats.totalSources, icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Catégorisées', value: stats.categorized, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'En attente', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Doublons', value: stats.duplicates, icon: Copy, color: stats.duplicates > 0 ? 'text-red-600' : 'text-neutral-400', bg: stats.duplicates > 0 ? 'bg-red-50' : 'bg-neutral-50' },
          { label: 'Exécutions', value: agent.runs_count, icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50' },
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

      {/* Progress bar */}
      <div className="card-lg mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-neutral-700">Progression catégorisation</span>
          <span className="text-xs text-neutral-500">{progressPct}%</span>
        </div>
        <div className="w-full bg-neutral-100 rounded-full h-2.5">
          <div
            className="bg-teal-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-neutral-400">
            {stats.categorized} / {stats.totalSources} sources
          </span>
          {agent.last_run_at && (
            <span className="text-[10px] text-neutral-400">
              Dernière exécution : {fmtDate(agent.last_run_at)}
            </span>
          )}
        </div>
      </div>

      {/* Doublons détectés */}
      {duplicateGroups.length > 0 && (
        <div className="card-lg mb-6 border-l-4 border-red-400">
          <button
            onClick={() => setShowDuplicates(!showDuplicates)}
            className="flex items-center justify-between w-full"
          >
            <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
              <Copy size={14} className="text-red-500" />
              {stats.duplicates} doublon{stats.duplicates > 1 ? 's' : ''} détecté{stats.duplicates > 1 ? 's' : ''} ({duplicateGroups.length} domaine{duplicateGroups.length > 1 ? 's' : ''})
            </h3>
            {showDuplicates ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
          </button>
          <p className="text-[11px] text-neutral-500 mt-1">
            L&apos;agent désactive automatiquement les doublons lors de chaque exécution (garde le plus ancien).
          </p>

          {showDuplicates && (
            <div className="mt-4 space-y-3">
              {duplicateGroups.map(group => (
                <div key={group.canonicalDomain} className="bg-neutral-50 rounded-lg p-3 border border-neutral-200">
                  <div className="text-xs font-bold text-neutral-700 mb-2 flex items-center gap-1.5">
                    <Globe size={12} className="text-neutral-400" />
                    {group.canonicalDomain}
                    <span className="badge badge-red text-[9px] ml-1">{group.sources.length} entrées</span>
                  </div>
                  <div className="space-y-1.5">
                    {group.sources.map((src, i) => (
                      <div key={src.id} className="flex items-center gap-2 text-[11px]">
                        {i === 0 ? (
                          <span className="badge badge-green text-[9px] w-14 text-center flex-shrink-0">Gardée</span>
                        ) : (
                          <span className={`badge text-[9px] w-14 text-center flex-shrink-0 ${src.is_active ? 'badge-red' : 'badge-gray'}`}>
                            {src.is_active ? 'Doublon' : 'Inactif'}
                          </span>
                        )}
                        <span className="font-medium text-neutral-800 truncate max-w-[160px]">{src.name}</span>
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate flex items-center gap-0.5">
                          {src.url} <ExternalLink size={9} />
                        </a>
                        <span className="text-neutral-400 flex-shrink-0 ml-auto">{fmtDate(src.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="card-lg mb-6">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Contrôles</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runNow(false)}
            disabled={running || agent.status !== 'active'}
            className="btn-primary text-xs flex items-center gap-1.5 px-4 py-2 disabled:opacity-50"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'En cours...' : 'Catégoriser les nouvelles'}
          </button>
          <button
            onClick={() => runNow(true)}
            disabled={running || agent.status !== 'active'}
            className="btn-ghost text-xs flex items-center gap-1.5 px-4 py-2 disabled:opacity-50"
          >
            <RefreshCw size={13} />
            Re-catégoriser tout
          </button>
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
            onClick={deleteAgent}
            disabled={deleting}
            className="text-xs flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors font-medium disabled:opacity-50"
          >
            <Trash2 size={13} />
            Supprimer
          </button>
        </div>
      </div>

      {/* Run logs */}
      {showLogs && runLogs.length > 0 && (
        <div className="card-lg mb-6 bg-neutral-900 text-neutral-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <Activity size={12} /> Logs d&apos;exécution
            </h3>
            <button onClick={() => setShowLogs(false)} className="text-[10px] text-neutral-500 hover:text-neutral-300">
              Fermer
            </button>
          </div>
          <div className="font-mono text-[11px] space-y-0.5 max-h-60 overflow-y-auto">
            {runLogs.map((line, i) => (
              <div key={i} className={line.includes('✗') ? 'text-red-400' : line.includes('✓') ? 'text-green-400' : 'text-neutral-400'}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

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
              <select
                className="input"
                value={editModel}
                onChange={e => setEditModel(e.target.value)}
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (recommandé)</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (économique)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (legacy)</option>
              </select>
            </div>
            <div>
              <label className="label">Prompt système</label>
              <textarea
                className="input font-mono text-xs resize-none"
                rows={16}
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                Variables disponibles : {'{{url}}'}, {'{{name}}'}, {'{{source_category}}'}, {'{{sectors}}'}
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={savePrompt}
                disabled={saving}
                className="btn-primary text-xs flex items-center gap-1.5 px-5 py-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Sauvegarder
              </button>
            </div>
          </div>
        )}
      </div>

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
                  {['Statut', 'Déclencheur', 'Traitées', 'Mises à jour', 'Durée', 'Date'].map(h => (
                    <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <span className={`badge text-[10px] ${
                        run.status === 'done' ? 'badge-green' : run.status === 'running' ? 'badge-amber' : 'badge-red'
                      }`}>
                        {run.status === 'done' ? 'OK' : run.status === 'running' ? 'En cours' : 'Erreur'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600">
                      <span className={`badge text-[10px] ${
                        run.trigger === 'auto_insert' ? 'badge-blue' : run.trigger === 'bulk' ? 'badge-purple' : 'badge-gray'
                      }`}>
                        {run.trigger === 'auto_insert' ? 'Auto' : run.trigger === 'bulk' ? 'Masse' : 'Manuel'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 font-medium">{run.sources_processed}</td>
                    <td className="py-2.5 px-3 text-neutral-600 font-medium">{run.sources_updated}</td>
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
          </div>
        )}
      </div>
    </div>
  )
}
