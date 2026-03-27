'use client'
import { useState, useEffect } from 'react'
import { Play, Bot, Zap, ChevronDown, RefreshCw, CheckCircle, AlertCircle, Layers, Globe, Newspaper, BarChart2, Search, BrainCircuit } from 'lucide-react'

// ─── Sous-agents de l'Agent 1 (collecte parallèle) ───────────────────────────
const SUB_AGENTS = [
  {
    key:  'web_scanner',
    icon: Globe,
    name: 'Scanner Web',
    desc: 'Sites officiels + news directes de l\'entreprise',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    key:  'press_monitor',
    icon: Newspaper,
    name: 'Presse Monitor',
    desc: 'Reuters, Jeune Afrique, The Africa Report, Bloomberg',
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    key:  'analyst',
    icon: BarChart2,
    name: 'Analyste Marché',
    desc: 'Rapports sectoriels, forecasts, intelligence stratégique',
    color: 'text-violet-600 bg-violet-50',
  },
  {
    key:  'deep_research',
    icon: Search,
    name: 'Chercheur Multi-angle',
    desc: 'Concurrents, opportunités, expansion, partenariats',
    color: 'text-orange-600 bg-orange-50',
  },
  {
    key:  'deep_research_iterative',
    icon: BrainCircuit,
    name: 'Deep Research IA',
    desc: 'Itératif — Gemini génère & adapte ses propres requêtes (Perplexity-style)',
    color: 'text-rose-600 bg-rose-50',
  },
]

// ─── Pipeline d'agents ────────────────────────────────────────────────────────
const AGENTS = [
  {
    num:      1,
    name:     'Agent de Collecte Parallèle',
    model:    'Gemini 2.5 Flash',
    desc:     '5 agents spécialisés lancés simultanément — chacun couvre un angle différent et l\'ensemble des entreprises de la veille. Le rapport est généré automatiquement après la collecte.',
    endpoint: '/api/agents/scrape',
    color:    'orange',
    sources:  ['DuckDuckGo Lite (gratuit)', 'Google Search Grounding', 'Firecrawl (enrichissement)', 'LinkedIn Proxycurl', 'Sites officiels', 'Bibliothèque sources'],
    note:     'Déclenche automatiquement la synthèse (Phase 4)',
    hasSubAgents: true,
  },
  {
    num:      2,
    name:     'Rapport de Synthèse',
    model:    'Gemini 2.5 Flash',
    desc:     'Synthétise les signaux collectés en rapport professionnel structuré avec citations sources vérifiables. Auto-déclenché après l\'Agent 1 — peut aussi être relancé manuellement.',
    endpoint: '/api/agents/synthesize',
    color:    'amber',
    sources:  ['Signaux Agent 1 (non traités)'],
    note:     'Auto-déclenché en Phase 4 de l\'Agent 1',
    hasSubAgents: false,
  },
  {
    num:      3,
    name:     'Analyse de Marché',
    model:    'Gemini 2.5 Flash',
    desc:     'Analyse macro d\'un secteur — tendances structurelles, acteurs dominants, signaux de disruption, benchmarks concurrentiels.',
    endpoint: '/api/agents/analyze',
    color:    'green',
    sources:  ['Rapports Agent 2', 'Données historiques'],
    note:     null,
    hasSubAgents: false,
  },
  {
    num:      4,
    name:     'Recommandations Stratégiques',
    model:    'Gemini 2.5 Flash',
    desc:     'Croise l\'analyse de marché avec les objectifs de la veille pour produire des actions concrètes, priorisées et scorées.',
    endpoint: '/api/agents/strategy',
    color:    'purple',
    sources:  ['Analyse Agent 3', 'Objectifs veille'],
    note:     null,
    hasSubAgents: false,
  },
]

const COLOR = {
  orange: { badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: 'bg-orange-100 text-orange-700' },
  amber:  { badge: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-500',  icon: 'bg-amber-50 text-amber-700'   },
  green:  { badge: 'bg-green-50 text-green-700 border-green-200',     dot: 'bg-green-500',  icon: 'bg-green-50 text-green-700'   },
  purple: { badge: 'bg-purple-50 text-purple-700 border-purple-200',  dot: 'bg-purple-500', icon: 'bg-purple-50 text-purple-700' },
}

type ResultState = { type: 'success' | 'error'; message: string; detail?: string }

export default function AgentsPage() {
  const [watches, setWatches]   = useState<{ id: string; name: string }[]>([])
  const [watchId, setWatchId]   = useState<string>('')
  const [running, setRunning]   = useState<number | null>(null)
  const [results, setResults]   = useState<Record<number, ResultState>>({})
  const [loading, setLoading]   = useState(true)

  // Charge les veilles de l'utilisateur
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

  async function runAgent(agent: typeof AGENTS[0]) {
    if (!watchId) { alert('Sélectionnez une veille d\'abord.'); return }
    setRunning(agent.num)
    setResults(prev => { const n = { ...prev }; delete n[agent.num]; return n })
    try {
      const res  = await fetch(agent.endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ watchId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setResults(prev => ({
          ...prev,
          [agent.num]: { type: 'error', message: data.error || `Erreur ${res.status}` },
        }))
      } else {
        const detail = agent.num === 1
          ? `${data.total_signals ?? 0} signaux collectés${data.report_ready ? ' · Rapport généré ✓' : ''}`
          : agent.num === 2
          ? `${data.insights ?? 0} insights · ${data.sources ?? 0} sources citées`
          : `${data.recommendations ?? data.insights ?? 0} éléments produits`
        setResults(prev => ({
          ...prev,
          [agent.num]: { type: 'success', message: 'Terminé avec succès', detail },
        }))
      }
    } catch (e: any) {
      setResults(prev => ({
        ...prev,
        [agent.num]: { type: 'error', message: 'Erreur de connexion', detail: e?.message },
      }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center flex-shrink-0">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900">Agents IA</h2>
            <p className="text-xs text-neutral-500">5 agents de collecte en parallèle · Pipeline de synthèse automatique</p>
          </div>
        </div>

        {/* Sélecteur de veille */}
        <div className="relative flex-shrink-0">
          <select
            value={watchId}
            onChange={e => setWatchId(e.target.value)}
            disabled={loading || watches.length === 0}
            className="appearance-none text-xs font-medium pl-3 pr-8 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-700 cursor-pointer focus:outline-none focus:border-blue-700 disabled:opacity-50"
          >
            {loading    && <option>Chargement…</option>}
            {!loading && watches.length === 0 && <option value="">Aucune veille</option>}
            {watches.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Pipeline visuel ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-2">
        {/* Phase parallèle — agent 1 */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-orange-100 text-orange-700 border-orange-200 text-xs font-medium flex-shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          <Layers size={11} />
          Collecte ×5
        </div>
        <span className="text-neutral-300 text-lg flex-shrink-0">→</span>
        {/* Agents 2-4 séquentiels */}
        {AGENTS.slice(1).map((a, i) => (
          <div key={a.num} className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${COLOR[a.color as keyof typeof COLOR].badge}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${COLOR[a.color as keyof typeof COLOR].dot}`} />
              Agent {a.num}
            </div>
            {i < 2 && <span className="text-neutral-300 text-lg">→</span>}
          </div>
        ))}
        <span className="text-neutral-300 text-lg flex-shrink-0">→</span>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600 flex-shrink-0">
          💬 Assistant IA
        </div>
      </div>

      {/* ── Cartes agents ────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {AGENTS.map(agent => {
          const col    = COLOR[agent.color as keyof typeof COLOR]
          const result = results[agent.num]
          const isRunning = running === agent.num

          return (
            <div key={agent.num} className="card-lg">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 border ${col.badge}`}>
                    {agent.num}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">{agent.name}</h3>
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      Modèle : {agent.model}
                      {agent.note && (
                        <span className="ml-2 text-blue-600">· {agent.note}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => runAgent(agent)}
                  disabled={running !== null || !watchId}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all
                    ${isRunning
                      ? 'bg-amber-50 text-amber-700 border border-amber-200 cursor-wait'
                      : 'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}>
                  {isRunning ? (
                    <><RefreshCw size={11} className="animate-spin" /> En cours…</>
                  ) : (
                    <><Play size={11} /> Lancer</>
                  )}
                </button>
              </div>

              <p className="text-xs text-neutral-600 leading-relaxed mb-3">{agent.desc}</p>

              {/* Sous-agents (Agent 1 uniquement) */}
              {agent.hasSubAgents && (
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3">
                  {SUB_AGENTS.map(sa => {
                    const Icon = sa.icon
                    return (
                      <div key={sa.key} className={`rounded-lg p-2 ${sa.color.split(' ')[1]}`}>
                        <div className={`flex items-center gap-1.5 mb-1`}>
                          <Icon size={11} className={sa.color.split(' ')[0]} />
                          <span className={`text-[10px] font-bold ${sa.color.split(' ')[0]}`}>{sa.name}</span>
                        </div>
                        <p className="text-[9px] text-neutral-500 leading-tight">{sa.desc}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Sources */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {agent.sources.map(s => (
                  <span key={s} className="text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-full">{s}</span>
                ))}
              </div>

              {/* Résultat */}
              {result && (
                <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg font-medium mt-2 ${
                  result.type === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-green-50 text-green-700'
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

              {/* Indicateur de progression */}
              {isRunning && (
                <div className="mt-2">
                  <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                  {agent.num === 1 && (
                    <p className="text-[10px] text-neutral-400 mt-1.5">
                      5 agents en parallèle · DuckDuckGo + Gemini Grounding · Génération rapport…
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Note architecture ────────────────────────────────────────────── */}
      <div className="mt-6 p-4 bg-neutral-50 border border-neutral-200 rounded-xl">
        <p className="text-xs font-bold text-neutral-700 mb-2">Architecture de collecte</p>
        <div className="text-[11px] text-neutral-500 space-y-1 leading-relaxed">
          <p>• <strong className="text-neutral-700">Agent 1</strong> lance 5 sous-agents en <strong className="text-neutral-700">parallèle</strong> (Promise.allSettled) — si l'un échoue, les 4 autres continuent.</p>
          <p>• <strong className="text-neutral-700">Deep Research IA</strong> est le seul agent itératif : Gemini génère ses propres sous-questions, puis analyse les gaps et relance une 2ème recherche ciblée.</p>
          <p>• Le <strong className="text-neutral-700">Rapport de synthèse</strong> est généré automatiquement en Phase 4 de l'Agent 1 — pas besoin de le lancer manuellement sauf pour une resynthèse.</p>
          <p>• <strong className="text-neutral-700">DuckDuckGo Lite</strong> est utilisé gratuitement comme moteur principal — aucune clé API requise pour la recherche web de base.</p>
        </div>
      </div>
    </div>
  )
}
