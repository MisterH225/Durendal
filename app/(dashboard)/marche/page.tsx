'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Loader2, AlertTriangle, Eye, BarChart3,
  ExternalLink, ArrowRight, ChevronDown,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = [
  '#0F4C81', '#BA7517', '#639922', '#C53030', '#6B46C1',
  '#2B6CB0', '#D69E2E', '#38A169', '#E53E3E', '#805AD5',
]

const SIGNAL_TYPE_CONFIG: Record<string, { label: string; bg: string; border: string; text: string; icon: string }> = {
  funding:     { label: 'Financement',  bg: 'bg-green-50',  border: 'border-green-100', text: 'text-green-700',  icon: '💰' },
  partnership: { label: 'Partenariat',  bg: 'bg-blue-50',   border: 'border-blue-100',  text: 'text-blue-700',   icon: '🤝' },
  expansion:   { label: 'Expansion',    bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-700', icon: '🌍' },
  contract:    { label: 'Contrat',      bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700',  icon: '📋' },
  product:     { label: 'Produit',      bg: 'bg-teal-50',   border: 'border-teal-100',   text: 'text-teal-700',   icon: '🚀' },
  financial:   { label: 'Financier',    bg: 'bg-red-50',    border: 'border-red-100',     text: 'text-red-700',    icon: '📊' },
  news:        { label: 'Actualité',    bg: 'bg-neutral-50', border: 'border-neutral-200', text: 'text-neutral-700', icon: '📰' },
}

interface WatchItem {
  id: string
  name: string
  sectors: string[]
  countries: string[]
  companies: string[]
}

interface KeySignal {
  id: string
  title: string
  content: string
  type: string
  relevance: number
  company: string | null
  url: string | null
}

interface MarcheData {
  watches: WatchItem[]
  watch?: WatchItem
  companies: string[]
  activityData: Record<string, any>[]
  pieData: { name: string; value: number }[]
  pieSource: 'agent3' | 'signals'
  keySignals: KeySignal[]
  totalSignals: number
  aiInsight: string | null
  marketReport: { id: string; title: string; date: string } | null
}

export default function MarchePage() {
  const [watches, setWatches] = useState<WatchItem[]>([])
  const [selectedWatchId, setSelectedWatchId] = useState<string | null>(null)
  const [data, setData] = useState<MarcheData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/marche')
      .then(r => r.json())
      .then(d => {
        setWatches(d.watches ?? [])
        if (d.watches?.length > 0) {
          setSelectedWatchId(d.watches[0].id)
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Impossible de charger les veilles')
        setLoading(false)
      })
  }, [])

  const loadWatchData = useCallback(async (wId: string) => {
    setDataLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/marche?watchId=${wId}`)
      const d: MarcheData = await r.json()
      setData(d)
    } catch {
      setError('Erreur lors du chargement des données')
    } finally {
      setDataLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedWatchId) loadWatchData(selectedWatchId)
  }, [selectedWatchId, loadWatchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    )
  }

  if (watches.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <BarChart3 size={36} className="text-neutral-200 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-neutral-800 mb-2">Aucune veille active</h2>
        <p className="text-sm text-neutral-500 mb-6">
          Créez une veille concurrentielle pour voir les analyses de marché ici.
        </p>
        <Link href="/veilles/new" className="btn-primary text-sm px-5 py-2.5">
          Créer une veille
        </Link>
      </div>
    )
  }

  const selectedWatch = watches.find(w => w.id === selectedWatchId)

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">
      {/* ── Sélecteur de veille ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative">
          <select
            value={selectedWatchId ?? ''}
            onChange={e => setSelectedWatchId(e.target.value)}
            className="text-sm pl-3 pr-8 py-2 border border-neutral-200 rounded-lg bg-white text-neutral-900 outline-none focus:border-blue-700 appearance-none min-w-[220px]"
          >
            {watches.map(w => (
              <option key={w.id} value={w.id}>
                {w.name} — {w.companies.length} entreprise{w.companies.length > 1 ? 's' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
        </div>

        {selectedWatch && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span className="px-2 py-0.5 bg-neutral-100 rounded-md">
              {selectedWatch.sectors.join(', ') || 'Multi-secteur'}
            </span>
            <span className="px-2 py-0.5 bg-neutral-100 rounded-md">
              {selectedWatch.countries.join(', ') || 'International'}
            </span>
          </div>
        )}

        {data?.marketReport && (
          <Link
            href={`/veilles/${selectedWatchId}/reports/${data.marketReport.id}`}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            <Eye size={12} /> Voir le rapport complet
          </Link>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {dataLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={24} />
          <span className="ml-2 text-sm text-neutral-500">Chargement des données...</span>
        </div>
      ) : data && data.totalSignals === 0 ? (
        <EmptyState watchId={selectedWatchId!} />
      ) : data ? (
        <WatchAnalysis data={data} watchId={selectedWatchId!} />
      ) : null}
    </div>
  )
}

function EmptyState({ watchId }: { watchId: string }) {
  return (
    <div className="card-lg flex flex-col items-center py-16 text-center">
      <BarChart3 size={32} className="text-neutral-200 mb-3" />
      <h3 className="text-sm font-bold text-neutral-800 mb-1">Pas encore de données</h3>
      <p className="text-xs text-neutral-500 mb-4 max-w-sm">
        Lancez un scan depuis la page de la veille pour collecter des signaux et générer l'analyse de marché.
      </p>
      <Link href={`/veilles/${watchId}`} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
        Aller à la veille <ArrowRight size={12} />
      </Link>
    </div>
  )
}

function WatchAnalysis({ data, watchId }: { data: MarcheData; watchId: string }) {
  const { companies, activityData, pieData, pieSource, keySignals, totalSignals, aiInsight, marketReport } = data

  return (
    <>
      {/* ── Graphique activité concurrentielle ──────────────────── */}
      {activityData.length > 1 && companies.length > 0 && (
        <div className="card-lg mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Activité concurrentielle</h2>
              <p className="text-xs text-neutral-500">
                Signaux collectés par entreprise ({totalSignals} total)
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {companies.slice(0, 6).map((c, i) => (
                <div key={c} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-xs text-neutral-500">{c}</span>
                </div>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={activityData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F8" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#718096' }} />
              <YAxis tick={{ fontSize: 11, fill: '#718096' }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid #E2E8F0' }} />
              {companies.slice(0, 6).map((c, i) => (
                <Line
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={i === 0 ? 2.5 : 2}
                  dot={false}
                  strokeDasharray={i >= 3 ? '4 2' : undefined}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {activityData.length <= 1 && (
        <div className="card-lg mb-4 text-center py-10">
          <BarChart3 size={24} className="text-neutral-200 mx-auto mb-2" />
          <p className="text-xs text-neutral-500">
            Pas assez de données pour afficher l'évolution.
            <br />Les graphiques apparaîtront après plusieurs collectes.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Signaux clés ──────────────────────────────────────── */}
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-4">
            Signaux clés
            <span className="ml-2 text-[10px] font-normal text-neutral-400">Top pertinence</span>
          </h2>
          {keySignals.length > 0 ? (
            <div className="space-y-3">
              {keySignals.map(s => {
                const cfg = SIGNAL_TYPE_CONFIG[s.type] ?? SIGNAL_TYPE_CONFIG.news
                return (
                  <div key={s.id} className={`flex gap-3 p-3 rounded-lg ${cfg.bg} border ${cfg.border}`}>
                    <div className="flex-shrink-0 text-base">{cfg.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.text}`}>
                          {cfg.label}
                        </span>
                        {s.company && (
                          <span className="text-[10px] text-neutral-400">· {s.company}</span>
                        )}
                        <span className="text-[10px] text-neutral-300 ml-auto">
                          {Math.round(s.relevance * 100)}%
                        </span>
                      </div>
                      <div className="text-xs font-medium text-neutral-800 mb-0.5">{s.title}</div>
                      <div className="text-xs text-neutral-600 leading-relaxed line-clamp-2">
                        {s.content}
                      </div>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-blue-600 hover:underline mt-1 inline-flex items-center gap-0.5">
                          Source <ExternalLink size={8} />
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 text-center py-6">Aucun signal collecté</p>
          )}
        </div>

        {/* ── Répartition des signaux / parts de marché ──────────── */}
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-1">
            {pieSource === 'agent3' ? 'Parts de marché estimées' : 'Répartition des signaux'}
          </h2>
          <p className="text-[10px] text-neutral-400 mb-3">
            {pieSource === 'agent3' ? 'Source : Agent analyse marché' : 'Basé sur le volume de signaux collectés'}
          </p>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ fontSize: 11, color: '#4A5568' }}>{v}</span>}
                  />
                  <Tooltip
                    formatter={(v: any) => [pieSource === 'agent3' ? `${v}%` : `${v} signaux`, '']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 p-3 bg-neutral-50 rounded-lg">
                <div className="text-xs font-bold text-neutral-700 mb-1">Analyse</div>
                <div className="text-xs text-neutral-600 leading-relaxed">
                  {pieData.length > 0 && (
                    <>
                      <strong>{pieData[0].name}</strong> domine avec{' '}
                      {pieSource === 'agent3'
                        ? `${pieData[0].value}% de part de marché estimée`
                        : `${pieData[0].value} signaux collectés (${Math.round((pieData[0].value / pieData.reduce((s, p) => s + p.value, 0)) * 100)}%)`
                      }
                      {pieData.length > 1 && (
                        <>, suivi de <strong>{pieData[1].name}</strong> ({pieSource === 'agent3' ? `${pieData[1].value}%` : `${pieData[1].value} signaux`})</>
                      )}
                      .
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-neutral-400 text-center py-10">Aucune donnée disponible</p>
          )}
        </div>
      </div>

      {/* ── Insight IA ──────────────────────────────────────────── */}
      {aiInsight ? (
        <div className="mt-4 p-4 bg-blue-700 rounded-xl text-white">
          <div className="flex items-start gap-3">
            <TrendingUp size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-bold">Analyse IA — Résumé stratégique</div>
                {marketReport && (
                  <Link
                    href={`/veilles/${watchId}/reports/${marketReport.id}`}
                    className="text-[10px] text-blue-200 hover:text-white flex items-center gap-1"
                  >
                    Rapport complet <ArrowRight size={10} />
                  </Link>
                )}
              </div>
              <div className="text-xs text-blue-200 leading-relaxed">
                {aiInsight.length > 500 ? aiInsight.slice(0, 500) + '…' : aiInsight}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 p-4 bg-neutral-100 rounded-xl">
          <div className="flex items-start gap-3">
            <TrendingUp size={18} className="text-neutral-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-neutral-600 mb-1">Analyse IA non disponible</div>
              <div className="text-xs text-neutral-500 leading-relaxed">
                L'analyse IA sera générée automatiquement par l'Agent 3 (Analyse de marché) après le prochain scan.
                <br />
                <Link href={`/veilles/${watchId}`} className="text-blue-600 hover:underline mt-1 inline-block">
                  Lancer un scan →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
