'use client'
import { useState } from 'react'
import { Play, Bot, Zap } from 'lucide-react'

const agents = [
  {
    num: 1, name: 'Agent de Scraping Web', model: 'Claude Haiku (économique)',
    desc: 'Collecte automatique depuis toutes les sources configurées : presse africaine, sites web, flux RSS.',
    endpoint: '/api/agents/scrape',
    color: 'blue', sources: ['LinkedIn via Proxycurl', 'Presse africaine', 'Sites officiels', 'RSS'],
    stats: [
      { label: 'LinkedIn', value: '312' },
      { label: 'Presse', value: '198' },
      { label: 'Sites web', value: '224' },
      { label: 'Réseaux soc.', value: '113' },
    ]
  },
  {
    num: 2, name: 'Agent de Synthèse & Rédaction', model: 'Claude Sonnet',
    desc: 'Transforme les signaux bruts en insights structurés et rédige des rapports de veille professionnels.',
    endpoint: '/api/agents/synthesize',
    color: 'amber', sources: ['Signaux Agent 1', 'Documents bibliothèque'],
    stats: []
  },
  {
    num: 3, name: 'Agent d\'Analyse de Marché', model: 'Claude Sonnet',
    desc: 'Analyse macro d\'un secteur ou segment — tendances, acteurs dominants, signaux de disruption.',
    endpoint: '/api/agents/analyze',
    color: 'green', sources: ['Rapports Agent 2', 'Données historiques'],
    stats: []
  },
  {
    num: 4, name: 'Agent de Recommandations Stratégiques', model: 'Claude Sonnet',
    desc: 'Croise l\'analyse de marché avec vos objectifs pour produire des actions concrètes avec score de confiance.',
    endpoint: '/api/agents/strategy',
    color: 'purple', sources: ['Analyse Agent 3', 'Objectifs utilisateur'],
    stats: []
  },
]

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
}
const dotMap: Record<string, string> = {
  blue: 'bg-blue-500', amber: 'bg-amber-500', green: 'bg-green-500', purple: 'bg-purple-500'
}

export default function AgentsPage() {
  const [running, setRunning] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, string>>({})

  async function runAgent(agent: typeof agents[0]) {
    setRunning(agent.num)
    try {
      const res = await fetch(agent.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchId: 'demo' }),
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [agent.num]: data.error || `Terminé — ${data.signals || data.insights || data.recommendations || 0} éléments` }))
    } catch {
      setResults(prev => ({ ...prev, [agent.num]: 'Erreur de connexion' }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 lg:pb-0">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center">
          <Bot size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-neutral-900">Agents IA</h2>
          <p className="text-xs text-neutral-500">4 agents actifs · Pipeline de traitement séquentiel</p>
        </div>
      </div>

      {/* Pipeline visual */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {agents.map((a, i) => (
          <div key={a.num} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${colorMap[a.color]}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${dotMap[a.color]}`} />
              Agent {a.num}
            </div>
            {i < agents.length - 1 && <span className="text-neutral-300 text-lg">→</span>}
          </div>
        ))}
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          <span className="text-neutral-300 text-lg">→</span>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-600">
            💬 Assistant IA
          </div>
        </div>
      </div>

      {/* Agent cards */}
      <div className="space-y-4">
        {agents.map(agent => (
          <div key={agent.num} className="card-lg">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 border ${colorMap[agent.color]}`}>
                  {agent.num}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">{agent.name}</h3>
                  <div className="text-[10px] text-neutral-400 mt-0.5">Modèle : {agent.model}</div>
                </div>
              </div>
              <button
                onClick={() => runAgent(agent)}
                disabled={running !== null}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all
                  ${running === agent.num
                    ? 'bg-amber-50 text-amber-700 border border-amber-200 cursor-wait'
                    : 'bg-blue-700 text-white hover:bg-blue-800'
                  }`}>
                {running === agent.num ? (
                  <><Zap size={12} className="animate-pulse" /> En cours...</>
                ) : (
                  <><Play size={12} /> Lancer</>
                )}
              </button>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed mb-3">{agent.desc}</p>

            {/* Sources */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {agent.sources.map(s => (
                <span key={s} className="text-[10px] px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-full">{s}</span>
              ))}
            </div>

            {/* Stats */}
            {agent.stats.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {agent.stats.map(stat => (
                  <div key={stat.label} className="bg-neutral-50 rounded-lg p-2 text-center">
                    <div className="text-sm font-bold text-neutral-900">{stat.value}</div>
                    <div className="text-[10px] text-neutral-400">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Result feedback */}
            {results[agent.num] && (
              <div className={`text-xs px-3 py-2 rounded-lg font-medium ${
                results[agent.num].includes('Erreur') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {results[agent.num].includes('Erreur') ? '✗' : '✓'} {results[agent.num]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
