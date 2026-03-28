import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Bot, CheckCircle2, XCircle, Clock, Zap, Settings2,
  Globe, Newspaper, BarChart2, Search, BrainCircuit, Layers,
  TrendingUp, Activity, Tag, Crosshair,
} from 'lucide-react'
import JobsHistory from './JobsHistory'

// ─── Pipeline d'agents (côté admin) ──────────────────────────────────────────
const AGENTS = [
  {
    num:    1,
    name:   'Agent Collecte Parallèle',
    model:  'Gemini 2.5 Flash',
    description: '5 sous-agents lancés simultanément couvrent toutes les entreprises de la veille : scanner web, presse africaine, analyse marché, deep research fixe et deep research itératif (Perplexity-style).',
    color:  'text-orange-600',
    bg:     'bg-orange-50',
    border: 'border-orange-400',
    subAgents: [
      { key: 'web_scanner',             icon: Globe,         name: 'Scanner Web' },
      { key: 'press_monitor',           icon: Newspaper,     name: 'Presse Monitor' },
      { key: 'analyst',                 icon: BarChart2,     name: 'Analyste' },
      { key: 'deep_research',           icon: Search,        name: 'Chercheur Multi' },
      { key: 'deep_research_iterative', icon: BrainCircuit,  name: 'Deep Research IA' },
    ],
  },
  {
    num:    2,
    name:   'Agent Synthèse & Rapport',
    model:  'Gemini 2.5 Flash',
    description: 'Synthétise les signaux bruts en rapport structuré avec citations sources vérifiables. Auto-déclenché par l\'Agent 1 (Phase 4) — peut aussi être relancé manuellement.',
    color:  'text-amber-600',
    bg:     'bg-amber-50',
    border: 'border-amber-400',
    subAgents: [],
  },
  {
    num:    3,
    name:   'Agent Analyse Marché',
    model:  'Gemini 2.5 Flash',
    description: 'Identifie les tendances structurelles, acteurs dominants, opportunités et signaux de disruption sur les marchés surveillés.',
    color:  'text-blue-600',
    bg:     'bg-blue-50',
    border: 'border-blue-400',
    subAgents: [],
  },
  {
    num:    4,
    name:   'Agent Stratégie',
    model:  'Gemini 2.5 Flash',
    description: 'Formule des recommandations stratégiques personnalisées, priorisées et scorées, croisées avec les objectifs de la veille.',
    color:  'text-purple-600',
    bg:     'bg-purple-50',
    border: 'border-purple-400',
    subAgents: [],
  },
  {
    num:    5,
    name:   'Agent Prédiction',
    model:  'Gemini 2.5 Flash + MiroFish',
    description: 'Produit des analyses prédictives : prochain mouvement anticipé, intention stratégique déduite et recommandations de contre-positionnement. Enrichissable par le module MiroFish (simulation multi-agents).',
    color:  'text-indigo-600',
    bg:     'bg-indigo-50',
    border: 'border-indigo-400',
    subAgents: [],
  },
]

// ─── Formatage durée ──────────────────────────────────────────────────────────
function fmtDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—'
  const s = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default async function AdminAgentsPage() {
  const supabase = createClient()

  const [
    { data: recentJobs },
    { count: totalJobs },
    { count: runningJobs },
    { count: failedJobs },
    { data: signalsAgg },
  ] = await Promise.all([
    supabase
      .from('agent_jobs')
      .select('*, watches(name)')
      .order('started_at', { ascending: false })
      .limit(30),
    supabase.from('agent_jobs').select('*', { count: 'exact', head: true }),
    supabase.from('agent_jobs').select('*', { count: 'exact', head: true }).eq('status', 'running'),
    supabase.from('agent_jobs').select('*', { count: 'exact', head: true }).eq('status', 'error'),
    supabase.from('agent_jobs').select('signals_count').eq('agent_number', 1).eq('status', 'done'),
  ])

  const totalSignals = (signalsAgg ?? []).reduce((sum: number, j: any) => sum + (j.signals_count ?? 0), 0)

  // Groupe les jobs récents par numéro d'agent
  const jobsByAgent = (recentJobs ?? []).reduce((acc: Record<number, any[]>, job: any) => {
    const n = job.agent_number || 1
    if (!acc[n]) acc[n] = []
    acc[n].push(job)
    return acc
  }, {})

  // Calcule le breakdown moyen des sous-agents pour Agent 1 (depuis metadata.breakdown_agents)
  const agent1Jobs = jobsByAgent[1] ?? []
  const breakdownAvg: Record<string, number> = {}
  let breakdownCount = 0
  for (const job of agent1Jobs) {
    const bd = job.metadata?.breakdown_agents
    if (!bd) continue
    breakdownCount++
    for (const [k, v] of Object.entries(bd)) {
      breakdownAvg[k] = (breakdownAvg[k] ?? 0) + (v as number)
    }
  }
  if (breakdownCount > 0) {
    for (const k of Object.keys(breakdownAvg)) {
      breakdownAvg[k] = Math.round(breakdownAvg[k] / breakdownCount)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Configuration des agents IA</h2>
          <p className="text-xs text-neutral-500 mt-0.5">5 agents de collecte parallèles · Pipeline de synthèse automatique · Gemini 2.5 Flash</p>
        </div>
        <span className="badge badge-blue text-xs">5 agents collecte + 4 pipeline</span>
      </div>

      {/* ── Métriques globales ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Jobs total',       value: totalJobs    || 0, icon: Bot,       color: 'text-blue-600',   bg: 'bg-blue-50'   },
          { label: 'En cours',         value: runningJobs  || 0, icon: Zap,       color: 'text-amber-600',  bg: 'bg-amber-50'  },
          { label: 'En erreur',        value: failedJobs   || 0, icon: XCircle,   color: 'text-red-600',    bg: 'bg-red-50'    },
          { label: 'Signaux collectés',value: totalSignals,       icon: TrendingUp,color: 'text-green-600',  bg: 'bg-green-50'  },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-neutral-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <div className="text-2xl font-bold text-neutral-900">{value.toLocaleString('fr-FR')}</div>
          </div>
        ))}
      </div>

      {/* ── Cartes agents ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {AGENTS.map(({ num, name, model, description, color, bg, border, subAgents }) => {
          const jobs        = jobsByAgent[num] ?? []
          const lastJob     = jobs[0]
          const successRate = jobs.length > 0
            ? Math.round(jobs.filter((j: any) => j.status === 'done').length / jobs.length * 100)
            : null
          const isRunning   = jobs.some((j: any) => j.status === 'running')
          const avgSignals  = num === 1 && jobs.length > 0
            ? Math.round(jobs.filter((j: any) => j.signals_count).reduce((s: number, j: any) => s + j.signals_count, 0) / jobs.filter((j: any) => j.signals_count).length || 0)
            : null

          return (
            <div key={num} className={`card-lg border-l-4 ${border}`}>
              <div className="flex items-start gap-2.5 mb-3">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                  {num === 1 ? <Layers size={16} className={color} /> : <Bot size={16} className={color} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-neutral-900">Agent {num} — {name}</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">Modèle : {model}</div>
                  <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">{description}</p>
                </div>
              </div>

              {/* Sous-agents de l'Agent 1 */}
              {subAgents.length > 0 && (
                <div className="grid grid-cols-5 gap-1 mb-3 mt-1">
                  {subAgents.map(({ key, icon: Icon, name: saName }) => (
                    <div key={key} className={`rounded-lg p-1.5 ${bg} flex flex-col items-center gap-0.5`} title={saName}>
                      <Icon size={11} className={color} />
                      <span className={`text-[8px] font-medium text-center leading-tight ${color}`}>{saName.split(' ')[0]}</span>
                      {breakdownCount > 0 && (
                        <span className="text-[8px] text-neutral-500 font-bold">
                          ~{breakdownAvg[key] ?? 0}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 pt-3 border-t border-neutral-100">
                <div className={`flex items-center gap-1 text-xs font-medium ${isRunning ? 'text-amber-600' : 'text-green-600'}`}>
                  {isRunning
                    ? <><Clock size={12} /> En cours</>
                    : <><CheckCircle2 size={12} /> Disponible</>}
                </div>
                <span className="text-neutral-200">|</span>
                <span className="text-xs text-neutral-400">{jobs.length} jobs récents</span>
                {successRate !== null && (
                  <>
                    <span className="text-neutral-200">|</span>
                    <span className="text-xs text-neutral-400">{successRate}% succès</span>
                  </>
                )}
                {avgSignals !== null && avgSignals > 0 && (
                  <>
                    <span className="text-neutral-200">|</span>
                    <span className="text-xs text-neutral-400">~{avgSignals} signaux/job</span>
                  </>
                )}
                {lastJob && (
                  <>
                    <span className="text-neutral-200">|</span>
                    <span className="text-xs text-neutral-400">Dernier : {fmtDate(lastJob.started_at ?? lastJob.created_at)}</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Agents autonomes (système) ──────────────────── */}
      <div className="mb-8">
        <h3 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
          <Tag size={14} className="text-teal-600" />
          Agents autonomes (système)
        </h3>
        <div className="space-y-3">
          <Link href="/admin/agents/categorizer" className="block">
            <div className="card-lg border-l-4 border-teal-400 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                  <Tag size={16} className="text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-neutral-900">Catégoriseur de sources</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">Agent autonome · Gemini 2.5 Flash · Auto-trigger à l&apos;ajout</div>
                  <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                    Analyse automatiquement les sites web de la bibliothèque pour les catégoriser par domaine (banque, construction, presse, etc.). Se déclenche à chaque ajout de source.
                  </p>
                </div>
                <span className="badge badge-blue text-[10px] flex-shrink-0 mt-0.5">Configurer →</span>
              </div>
            </div>
          </Link>

          <Link href="/admin/agents/prediction" className="block">
            <div className="card-lg border-l-4 border-indigo-400 hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <Crosshair size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-neutral-900">Moteur de Prédiction</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">Agent 5 · Gemini 2.5 Flash · Module MiroFish (optionnel)</div>
                  <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                    Analyse prédictive en trois axes : prochain mouvement anticipé, intention stratégique déduite et contre-positionnement. Enrichissable par la simulation multi-agents MiroFish.
                  </p>
                </div>
                <span className="badge badge-indigo text-[10px] flex-shrink-0 mt-0.5">Configurer →</span>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* ── Tableau des jobs récents ──────────────────────────────────────── */}
      <JobsHistory jobs={recentJobs ?? []} />
    </div>
  )
}
