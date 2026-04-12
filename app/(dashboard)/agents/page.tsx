'use client'
import { useState, useEffect } from 'react'
import {
  Play, Bot, Zap, ChevronDown, RefreshCw, CheckCircle, AlertCircle,
  Layers, Globe, Newspaper, BarChart2, Search, BrainCircuit,
  Shield, Target, TrendingUp, MessageSquare, Sparkles, Lock,
  FileSearch,
} from 'lucide-react'

const CHALLENGER_AGENTS = [
  { key: 'blind_spots', icon: Search,  name: 'Angles morts',     desc: 'Identifie les zones d\'ombre, hypothèses non vérifiées et biais',             color: 'text-amber-600 bg-amber-50' },
  { key: 'fact_check',  icon: Shield,  name: 'Validation faits', desc: 'Vérifie que chaque affirmation est étayée par des preuves tangibles',          color: 'text-blue-600 bg-blue-50' },
  { key: 'depth',       icon: Target,  name: 'Profondeur',       desc: 'Évalue la solidité des raisonnements et exige des arguments plus détaillés',   color: 'text-purple-600 bg-purple-50' },
]

type AgentDef = {
  num:           number
  name:          string
  model:         string
  desc:          string
  endpoint:      string
  color:         string
  sources:       string[]
  note:          string | null
  hasSubSteps?:  boolean
  hasChallengers?: boolean
  proOnly?:      boolean
}

const AGENTS: AgentDef[] = [
  {
    num: 1, name: 'Collecteur Gemini', model: 'Gemini 2.5 Flash + Google Search Grounding',
    desc: 'Recherche en temps réel via Google Search Grounding, extraction d\'articles complets, déduplication par fingerprint, et analyse IA structurée de chaque signal.',
    endpoint: '/api/agents/scrape', color: 'orange',
    sources: ['Gemini Search Grounding', 'Extraction d\'articles', 'Analyse IA structurée'],
    note: 'Déclenche toute la chaîne automatiquement', hasSubSteps: true,
  },
  {
    num: 2, name: 'Rapport de Synthèse', model: 'Gemini 2.5 Flash',
    desc: 'Synthétise les signaux collectés en rapport structuré avec citations sources. Prend en compte les rapports précédents pour mesurer les progressions.',
    endpoint: '/api/agents/synthesize', color: 'amber',
    sources: ['Signaux collectés + analyses', 'Rapports précédents'],
    note: 'Auto-déclenché après le Collecteur', hasSubSteps: false,
  },
  {
    num: 2.5, name: 'Pipeline Challenger', model: 'Gemini 2.5 Flash ×4',
    desc: '3 agents Challengers auditent le rapport en parallèle (angles morts, validation factuelle, profondeur argumentaire), puis l\'agent de Synthèse produit un rapport final enrichi et robuste.',
    endpoint: '', color: 'emerald',
    sources: ['Rapport Agent 2', 'Signaux bruts', 'Retours des 3 Challengers'],
    note: 'Auto-déclenché · Plans Pro & Business', hasSubSteps: false, hasChallengers: true, proOnly: true,
  },
  {
    num: 3, name: 'Analyse de Marché', model: 'Gemini 2.5 Flash',
    desc: 'Analyse macro — tendances structurelles, acteurs dominants, signaux de disruption, benchmarks concurrentiels, scénarios prospectifs.',
    endpoint: '/api/agents/analyze', color: 'green',
    sources: ['Rapport enrichi', 'Signaux avec analyses IA'],
    note: 'Auto-déclenché après l\'Agent 2', hasSubSteps: false,
  },
  {
    num: 4, name: 'Recommandations Stratégiques', model: 'Gemini 2.5 Flash',
    desc: 'Croise l\'analyse de marché avec les objectifs de veille pour produire un plan d\'action avec SWOT, roadmap et scoring.',
    endpoint: '/api/agents/strategy', color: 'purple',
    sources: ['Rapport Agent 2/3', 'Objectifs veille'],
    note: 'Auto-déclenché après l\'Agent 3', hasSubSteps: false,
  },
  {
    num: 5, name: 'Moteur de Prédictions', model: 'Gemini 2.5 Flash',
    desc: 'Produit une analyse prospective par entreprise : prochain mouvement anticipé, intention stratégique déduite, recommandations de contre-positionnement.',
    endpoint: '/api/agents/predict', color: 'indigo',
    sources: ['Rapports Agents 2-4', 'Signaux enrichis'],
    note: 'Auto-déclenché après l\'Agent 4', hasSubSteps: false,
  },
]

const COLOR: Record<string, { badge: string; dot: string; icon: string }> = {
  orange:  { badge: 'bg-orange-100 text-orange-700 border-orange-200',   dot: 'bg-orange-500',  icon: 'bg-orange-100 text-orange-700' },
  amber:   { badge: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500',   icon: 'bg-amber-50 text-amber-700' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-700' },
  green:   { badge: 'bg-green-50 text-green-700 border-green-200',      dot: 'bg-green-500',   icon: 'bg-green-50 text-green-700' },
  purple:  { badge: 'bg-purple-50 text-purple-700 border-purple-200',   dot: 'bg-purple-500',  icon: 'bg-purple-50 text-purple-700' },
  indigo:  { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-500',  icon: 'bg-indigo-50 text-indigo-700' },
}

type ResultState = { type: 'success' | 'error'; message: string; detail?: string }

export default function AgentsPage() {
  const [watches, setWatches]   = useState<{ id: string; name: string }[]>([])
  const [watchId, setWatchId]   = useState('')
  const [running, setRunning]   = useState<number | null>(null)
  const [results, setResults]   = useState<Record<number, ResultState>>({})
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/watches')
      .then(r => r.ok ? r.json() : { watches: [] })
      .then(d => {
        const list = d.watches ?? d ?? []
        setWatches(list)
        if (list.length > 0) setWatchId(list[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function runAgent(agent: AgentDef) {
    if (!watchId || !agent.endpoint) return
    setRunning(agent.num)
    setResults(prev => { const n = { ...prev }; delete n[agent.num]; return n })
    try {
      const res  = await fetch(agent.endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setResults(prev => ({ ...prev, [agent.num]: { type: 'error', message: data.error || `Erreur ${res.status}` } }))
      } else {
        const detail = agent.num === 1
          ? `${data.total_signals ?? 0} signaux Gemini · ${data.report_ready ? 'Rapport ✓' : ''} · Pipeline rapports exécuté`
          : `${data.insights ?? data.recommendations ?? 0} éléments produits`
        setResults(prev => ({ ...prev, [agent.num]: { type: 'success', message: 'Terminé', detail } }))
      }
    } catch (e: any) {
      setResults(prev => ({ ...prev, [agent.num]: { type: 'error', message: 'Erreur de connexion', detail: e?.message } }))
    } finally { setRunning(null) }
  }

  const displayNum = (n: number) => n === 2.5 ? '⚔' : String(n)

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center flex-shrink-0">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900">Agents IA</h2>
            <p className="text-xs text-neutral-500">Pipeline Gemini · Collecte → Rapport → Challengers → Analyse → Stratégie → Prédictions</p>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <select
            value={watchId} onChange={e => setWatchId(e.target.value)}
            disabled={loading || watches.length === 0}
            className="appearance-none text-xs font-medium pl-3 pr-8 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-700 cursor-pointer focus:outline-none focus:border-blue-700 disabled:opacity-50"
          >
            {loading && <option>Chargement…</option>}
            {!loading && watches.length === 0 && <option value="">Aucune veille</option>}
            {watches.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>
      </div>

      {/* Pipeline visuel */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {[
          { label: 'Gemini Search', color: COLOR.orange, icon: Sparkles },
          { label: 'Rapport', color: COLOR.amber, icon: Zap },
          { label: 'Challengers', color: COLOR.emerald, icon: Shield },
          { label: 'Marché', color: COLOR.green, icon: BarChart2 },
          { label: 'Stratégie', color: COLOR.purple, icon: Target },
          { label: 'Prédictions', color: COLOR.indigo, icon: TrendingUp },
          { label: 'Chat IA', color: { badge: 'bg-neutral-100 text-neutral-600 border-neutral-200', dot: 'bg-neutral-400', icon: '' }, icon: MessageSquare },
        ].map((step, i, arr) => (
          <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium ${step.color.badge}`}>
              <step.icon size={11} />
              {step.label}
            </div>
            {i < arr.length - 1 && <span className="text-neutral-300 text-sm">→</span>}
          </div>
        ))}
      </div>

      {/* Agent cards */}
      <div className="space-y-4">
        {AGENTS.map(agent => {
          const col = COLOR[agent.color] ?? COLOR.amber
          const result = results[agent.num]
          const isRunning = running === agent.num

          return (
            <div key={agent.num} className={`card-lg ${agent.proOnly ? 'border-emerald-200' : ''}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 border ${col.badge}`}>
                    {displayNum(agent.num)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-neutral-900">{agent.name}</h3>
                      {agent.proOnly && (
                        <span className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                          <Lock size={8} /> PRO+
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      Modèle : {agent.model}
                      {agent.note && <span className="ml-2 text-blue-600">· {agent.note}</span>}
                    </div>
                  </div>
                </div>
                {agent.endpoint && (
                  <button
                    onClick={() => runAgent(agent)}
                    disabled={running !== null || !watchId}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all ${
                      isRunning
                        ? 'bg-amber-50 text-amber-700 border border-amber-200 cursor-wait'
                        : 'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isRunning
                      ? <><RefreshCw size={11} className="animate-spin" /> En cours…</>
                      : <><Play size={11} /> Lancer</>}
                  </button>
                )}
              </div>

              <p className="text-xs text-neutral-600 leading-relaxed mb-3">{agent.desc}</p>

              {/* Sub-steps for Agent 1 (Gemini collector) */}
              {agent.hasSubSteps && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  {[
                    { icon: Globe,         name: 'Google Search Grounding', desc: 'Recherche web temps réel avec sources vérifiables', color: 'text-blue-600 bg-blue-50' },
                    { icon: FileSearch,    name: 'Extraction & Dédup',       desc: 'Articles complets, images OG, fingerprint 24h',    color: 'text-emerald-600 bg-emerald-50' },
                    { icon: BrainCircuit,  name: 'Analyse IA structurée',    desc: 'Impact concurrentiel, recommandations, risques',    color: 'text-purple-600 bg-purple-50' },
                  ].map(sa => {
                    const Icon = sa.icon
                    return (
                      <div key={sa.name} className={`rounded-lg p-2 ${sa.color.split(' ')[1]}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={11} className={sa.color.split(' ')[0]} />
                          <span className={`text-[10px] font-bold ${sa.color.split(' ')[0]}`}>{sa.name}</span>
                        </div>
                        <p className="text-[9px] text-neutral-500 leading-tight">{sa.desc}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Challenger sub-agents */}
              {agent.hasChallengers && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  {CHALLENGER_AGENTS.map(ca => {
                    const Icon = ca.icon
                    return (
                      <div key={ca.key} className={`rounded-lg p-2.5 ${ca.color.split(' ')[1]} border border-neutral-100`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={11} className={ca.color.split(' ')[0]} />
                          <span className={`text-[10px] font-bold ${ca.color.split(' ')[0]}`}>{ca.name}</span>
                        </div>
                        <p className="text-[9px] text-neutral-500 leading-tight">{ca.desc}</p>
                      </div>
                    )
                  })}
                  <div className="sm:col-span-3 rounded-lg p-2.5 bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles size={11} className="text-emerald-600" />
                      <span className="text-[10px] font-bold text-emerald-700">Agent de Synthèse Finale</span>
                    </div>
                    <p className="text-[9px] text-neutral-500 leading-tight">
                      Consolide les retours des 3 Challengers, comble les lacunes avec les signaux bruts et produit le rapport final enrichi.
                    </p>
                  </div>
                </div>
              )}

              {/* Sources */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {agent.sources.map(s => (
                  <span key={s} className="text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-full">{s}</span>
                ))}
              </div>

              {/* Result */}
              {result && (
                <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg font-medium mt-2 ${
                  result.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                }`}>
                  {result.type === 'error'
                    ? <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                    : <CheckCircle size={13} className="flex-shrink-0 mt-0.5" />}
                  <div>
                    <div>{result.message}</div>
                    {result.detail && <div className="opacity-80 font-normal mt-0.5">{result.detail}</div>}
                  </div>
                </div>
              )}

              {isRunning && (
                <div className="mt-2">
                  <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  {agent.num === 1 && (
                    <p className="text-[10px] text-neutral-400 mt-1.5">
                      Gemini Search Grounding · Extraction articles · Déduplication · Analyse IA structurée · Pipeline rapports…
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Architecture note */}
      <div className="mt-6 p-4 bg-neutral-50 border border-neutral-200 rounded-xl">
        <p className="text-xs font-bold text-neutral-700 mb-2">Architecture du pipeline</p>
        <div className="text-[11px] text-neutral-500 space-y-1 leading-relaxed">
          <p>• <strong className="text-neutral-700">Collecteur Gemini</strong> utilise Google Search Grounding pour une recherche web en temps réel, puis extrait les articles complets, déduplique par fingerprint (24h), et génère une analyse IA structurée par signal.</p>
          <p>• <strong className="text-neutral-700">Agent 2</strong> génère le rapport initial en analysant les signaux enrichis et en comparant avec les rapports précédents (progression/régression).</p>
          <p>• <strong className="text-emerald-700">Pipeline Challenger</strong> (Pro+) : 3 agents auditent le rapport en parallèle, puis l&apos;agent de synthèse produit un rapport final enrichi et robuste.</p>
          <p>• <strong className="text-neutral-700">Agents 3-4-5</strong> travaillent sur le rapport enrichi (si Challengers actifs) ou le rapport initial (plan Free).</p>
          <p>• <strong className="text-neutral-700">Chat IA</strong> permet de challenger le rapport final avec accès aux signaux et analyses structurées.</p>
          <p>• Les rapports sont <strong className="text-neutral-700">exportables en PDF</strong> depuis la page de chaque rapport.</p>
        </div>
      </div>
    </div>
  )
}
