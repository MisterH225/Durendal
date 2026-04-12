'use client'

import { useState, useEffect } from 'react'
import {
  Play, Bot, Zap, ChevronDown, RefreshCw, CheckCircle, AlertCircle,
  Globe, BarChart2, Search, BrainCircuit,
  Shield, Target, TrendingUp, MessageSquare, Sparkles, Lock,
  FileSearch,
} from 'lucide-react'

const CHALLENGER_AGENTS = [
  { key: 'blind_spots', icon: Search,  name: 'Angles morts',     desc: 'Identifie les zones d\'ombre, hypothèses non vérifiées et biais',             light: 'text-amber-600 bg-amber-50 border border-neutral-100', dark: 'text-amber-300 bg-amber-500/10 border border-amber-500/20' },
  { key: 'fact_check',  icon: Shield,  name: 'Validation faits', desc: 'Vérifie que chaque affirmation est étayée par des preuves tangibles',          light: 'text-blue-600 bg-blue-50 border border-neutral-100', dark: 'text-blue-300 bg-blue-500/10 border border-blue-500/20' },
  { key: 'depth',       icon: Target,  name: 'Profondeur',       desc: 'Évalue la solidité des raisonnements et exige des arguments plus détaillés',   light: 'text-purple-600 bg-purple-50 border border-neutral-100', dark: 'text-purple-300 bg-purple-500/10 border border-purple-500/20' },
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

const COLOR_LIGHT: Record<string, { badge: string; dot: string; icon: string }> = {
  orange:  { badge: 'bg-orange-100 text-orange-700 border-orange-200',   dot: 'bg-orange-500',  icon: 'bg-orange-100 text-orange-700' },
  amber:   { badge: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500',   icon: 'bg-amber-50 text-amber-700' },
  emerald: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', icon: 'bg-emerald-50 text-emerald-700' },
  green:   { badge: 'bg-green-50 text-green-700 border-green-200',      dot: 'bg-green-500',   icon: 'bg-green-50 text-green-700' },
  purple:  { badge: 'bg-purple-50 text-purple-700 border-purple-200',   dot: 'bg-purple-500',  icon: 'bg-purple-50 text-purple-700' },
  indigo:  { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-500',  icon: 'bg-indigo-50 text-indigo-700' },
}

const COLOR_DARK: Record<string, { badge: string; dot: string; icon: string }> = {
  orange:  { badge: 'bg-orange-500/15 text-orange-300 border-orange-500/25',   dot: 'bg-orange-400',  icon: 'bg-orange-500/15 text-orange-300' },
  amber:   { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25',      dot: 'bg-amber-400',   icon: 'bg-amber-500/15 text-amber-300' },
  emerald: { badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25', dot: 'bg-emerald-400', icon: 'bg-emerald-500/15 text-emerald-300' },
  green:   { badge: 'bg-green-500/15 text-green-300 border-green-500/25',      dot: 'bg-green-400',   icon: 'bg-green-500/15 text-green-300' },
  purple:  { badge: 'bg-purple-500/15 text-purple-300 border-purple-500/25',   dot: 'bg-purple-400',  icon: 'bg-purple-500/15 text-purple-300' },
  indigo:  { badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',   dot: 'bg-indigo-400',  icon: 'bg-indigo-500/15 text-indigo-300' },
}

type ResultState = { type: 'success' | 'error'; message: string; detail?: string }

export type AgentsPipelineVariant = 'light' | 'dark'

export function AgentsPipelineClient({ variant = 'light' }: { variant?: AgentsPipelineVariant }) {
  const isDark = variant === 'dark'
  const COLOR = isDark ? COLOR_DARK : COLOR_LIGHT

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

  const displayNum = (n: number) => (n === 2.5 ? '⚔' : String(n))

  const shellCls = isDark
    ? 'max-w-6xl mx-auto px-3 sm:px-4 py-6 pb-20 lg:pb-0'
    : 'max-w-4xl mx-auto pb-20 lg:pb-0'

  const chatStepColor = isDark
    ? { badge: 'bg-neutral-800 text-neutral-300 border-neutral-700', dot: 'bg-neutral-500', icon: '' }
    : { badge: 'bg-neutral-100 text-neutral-600 border-neutral-200', dot: 'bg-neutral-400', icon: '' }

  const subStepDefs = [
    { icon: Globe,        name: 'Google Search Grounding', desc: 'Recherche web temps réel avec sources vérifiables', lightText: 'text-blue-600', lightBox: 'bg-blue-50', darkText: 'text-blue-300', darkBox: 'bg-blue-500/10 border border-blue-500/20' },
    { icon: FileSearch,   name: 'Extraction & Dédup',      desc: 'Articles complets, images OG, fingerprint 24h',    lightText: 'text-emerald-600', lightBox: 'bg-emerald-50', darkText: 'text-emerald-300', darkBox: 'bg-emerald-500/10 border border-emerald-500/20' },
    { icon: BrainCircuit, name: 'Analyse IA structurée',   desc: 'Impact concurrentiel, recommandations, risques', lightText: 'text-purple-600', lightBox: 'bg-purple-50', darkText: 'text-purple-300', darkBox: 'bg-purple-500/10 border border-purple-500/20' },
  ]

  return (
    <div className={shellCls}>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center flex-shrink-0">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>Agents IA</h2>
            <p className={`text-xs ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>Pipeline Gemini · Collecte → Rapport → Challengers → Analyse → Stratégie → Prédictions</p>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <select
            value={watchId} onChange={e => setWatchId(e.target.value)}
            disabled={loading || watches.length === 0}
            className={
              isDark
                ? 'appearance-none text-xs font-medium pl-3 pr-8 py-2 border border-neutral-700 rounded-lg bg-neutral-900 text-neutral-200 cursor-pointer focus:outline-none focus:border-blue-500 disabled:opacity-50'
                : 'appearance-none text-xs font-medium pl-3 pr-8 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-700 cursor-pointer focus:outline-none focus:border-blue-700 disabled:opacity-50'
            }
          >
            {loading && <option>Chargement…</option>}
            {!loading && watches.length === 0 && <option value="">Aucune veille</option>}
            {watches.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`} />
        </div>
      </div>

      <div className={`flex items-center gap-1 mb-6 overflow-x-auto pb-2 ${isDark ? 'text-neutral-500' : ''}`}>
        {[
          { label: 'Gemini Search', color: COLOR.orange, icon: Sparkles },
          { label: 'Rapport', color: COLOR.amber, icon: Zap },
          { label: 'Challengers', color: COLOR.emerald, icon: Shield },
          { label: 'Marché', color: COLOR.green, icon: BarChart2 },
          { label: 'Stratégie', color: COLOR.purple, icon: Target },
          { label: 'Prédictions', color: COLOR.indigo, icon: TrendingUp },
          { label: 'Chat IA', color: chatStepColor, icon: MessageSquare },
        ].map((step, i, arr) => (
          <div key={step.label} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium ${step.color.badge}`}>
              <step.icon size={11} />
              {step.label}
            </div>
            {i < arr.length - 1 && <span className={`text-sm ${isDark ? 'text-neutral-600' : 'text-neutral-300'}`}>→</span>}
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {AGENTS.map(agent => {
          const col = COLOR[agent.color] ?? COLOR.amber
          const result = results[agent.num]
          const isRunning = running === agent.num

          const cardCls = isDark
            ? `rounded-xl border p-5 ${agent.proOnly ? 'border-emerald-500/30 bg-neutral-900/50' : 'border-neutral-800 bg-neutral-900/50'}`
            : `card-lg ${agent.proOnly ? 'border-emerald-200' : ''}`

          return (
            <div key={agent.num} className={cardCls}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 border ${col.badge}`}>
                    {displayNum(agent.num)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-neutral-900'}`}>{agent.name}</h3>
                      {agent.proOnly && (
                        <span className={`flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                          isDark
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-amber-100 text-amber-700 border-amber-200'
                        }`}>
                          <Lock size={8} /> PRO+
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                      Modèle : {agent.model}
                      {agent.note && <span className={`ml-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>· {agent.note}</span>}
                    </div>
                  </div>
                </div>
                {agent.endpoint && (
                  <button
                    onClick={() => runAgent(agent)}
                    disabled={running !== null || !watchId}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all ${
                      isRunning
                        ? isDark
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 cursor-wait'
                          : 'bg-amber-50 text-amber-700 border border-amber-200 cursor-wait'
                        : 'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {isRunning
                      ? <><RefreshCw size={11} className="animate-spin" /> En cours…</>
                      : <><Play size={11} /> Lancer</>}
                  </button>
                )}
              </div>

              <p className={`text-xs leading-relaxed mb-3 ${isDark ? 'text-neutral-400' : 'text-neutral-600'}`}>{agent.desc}</p>

              {agent.hasSubSteps && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  {subStepDefs.map(sa => {
                    const Icon = sa.icon
                    const tone = isDark ? sa.dark : sa.light
                    const [textC, ...rest] = tone.split(' ')
                    const bgC = rest.join(' ')
                    return (
                      <div key={sa.name} className={`rounded-lg p-2 ${bgC}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={11} className={textC} />
                          <span className={`text-[10px] font-bold ${textC}`}>{sa.name}</span>
                        </div>
                        <p className={`text-[9px] leading-tight ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>{sa.desc}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {agent.hasChallengers && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  {CHALLENGER_AGENTS.map(ca => {
                    const Icon = ca.icon
                    const box = isDark ? ca.dark : ca.light
                    const titleCls = box.split(' ')[0] ?? ''
                    return (
                      <div key={ca.key} className={`rounded-lg p-2.5 ${box}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon size={11} className={titleCls} />
                          <span className={`text-[10px] font-bold ${titleCls}`}>{ca.name}</span>
                        </div>
                        <p className="text-[9px] leading-tight text-neutral-500">{ca.desc}</p>
                      </div>
                    )
                  })}
                  <div className={`sm:col-span-3 rounded-lg p-2.5 border ${
                    isDark ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles size={11} className={isDark ? 'text-emerald-400' : 'text-emerald-600'} />
                      <span className={`text-[10px] font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Agent de Synthèse Finale</span>
                    </div>
                    <p className={`text-[9px] leading-tight ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
                      Consolide les retours des 3 Challengers, comble les lacunes avec les signaux bruts et produit le rapport final enrichi.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mb-2">
                {agent.sources.map(s => (
                  <span
                    key={s}
                    className={
                      isDark
                        ? 'text-[10px] px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded-full border border-neutral-700/80'
                        : 'text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-full'
                    }
                  >
                    {s}
                  </span>
                ))}
              </div>

              {result && (
                <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg font-medium mt-2 ${
                  result.type === 'error'
                    ? isDark ? 'bg-red-500/15 text-red-300 border border-red-500/25' : 'bg-red-50 text-red-700'
                    : isDark ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' : 'bg-green-50 text-green-700'
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
                  <div className={`h-1 rounded-full overflow-hidden ${isDark ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                    <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  {agent.num === 1 && (
                    <p className={`text-[10px] mt-1.5 ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                      Gemini Search Grounding · Extraction articles · Déduplication · Analyse IA structurée · Pipeline rapports…
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className={`mt-6 p-4 rounded-xl border ${
        isDark ? 'bg-neutral-900/50 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
      }`}>
        <p className={`text-xs font-bold mb-2 ${isDark ? 'text-neutral-200' : 'text-neutral-700'}`}>Architecture du pipeline</p>
        <div className={`text-[11px] space-y-1 leading-relaxed ${isDark ? 'text-neutral-500' : 'text-neutral-500'}`}>
          <p>• <strong className={isDark ? 'text-neutral-200' : 'text-neutral-700'}>Collecteur Gemini</strong> utilise Google Search Grounding pour une recherche web en temps réel, puis extrait les articles complets, déduplique par fingerprint (24h), et génère une analyse IA structurée par signal.</p>
          <p>• <strong className={isDark ? 'text-neutral-200' : 'text-neutral-700'}>Agent 2</strong> génère le rapport initial en analysant les signaux enrichis et en comparant avec les rapports précédents (progression/régression).</p>
          <p>• <strong className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>Pipeline Challenger</strong> (Pro+) : 3 agents auditent le rapport en parallèle, puis l&apos;agent de synthèse produit un rapport final enrichi et robuste.</p>
          <p>• <strong className={isDark ? 'text-neutral-200' : 'text-neutral-700'}>Agents 3-4-5</strong> travaillent sur le rapport enrichi (si Challengers actifs) ou le rapport initial (plan Free).</p>
          <p>• <strong className={isDark ? 'text-neutral-200' : 'text-neutral-700'}>Chat IA</strong> permet de challenger le rapport final avec accès aux signaux et analyses structurées.</p>
          <p>• Les rapports sont <strong className={isDark ? 'text-neutral-200' : 'text-neutral-700'}>exportables en PDF</strong> depuis la page de chaque rapport.</p>
        </div>
      </div>
    </div>
  )
}
