'use client'

import type { IntelligenceGraphNode, IntelligenceGraphEdge } from '@/lib/graph/types'
import { NODE_TYPE_CONFIG, EDGE_TYPE_CONFIG } from '@/lib/graph/types'

interface TimelinePanelProps {
  nodes: IntelligenceGraphNode[]
  edges: IntelligenceGraphEdge[]
  query: string
  selectedNodeId: string | null
  onNodeSelect: (id: string) => void
}

// ── Chronological narrative builder ───────────────────────────────────────────

interface NarrativeEntry {
  date: string
  text: string
  sourceIds: string[]
}

const TRANSITIONS_CAUSE = [
  'Ce qui entraîne',
  'En conséquence directe',
  'Résultat :',
  'Conséquence :',
]
const TRANSITIONS_SEQUENCE = [
  'Dans ce contexte,',
  'Parallèlement,',
  'Dans la foulée,',
  'Sur le même front,',
]
const TRANSITIONS_RESPONSE = [
  'En réponse,',
  'Face à cette situation,',
  'En réaction,',
  'Suite à ces développements,',
]
const TRANSITIONS_CONFIRM = [
  'Ce qui est confirmé par',
  'Corroboré par',
  'Appuyé par',
  'Confirmé par',
]

function pickTransition(arr: string[], seed: number): string {
  return arr[seed % arr.length]
}

function buildChronologicalNarrative(
  nodes: IntelligenceGraphNode[],
  edges: IntelligenceGraphEdge[],
  query: string,
): NarrativeEntry[] {
  const nodesMap = new Map(nodes.map(n => [n.id, n]))

  const adjacency = new Map<string, { edge: IntelligenceGraphEdge; neighbor: IntelligenceGraphNode }[]>()
  for (const edge of edges) {
    const src = nodesMap.get(edge.source)
    const tgt = nodesMap.get(edge.target)
    if (!src || !tgt) continue

    if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, [])
    adjacency.get(edge.source)!.push({ edge, neighbor: tgt })
    adjacency.get(edge.target)!.push({ edge, neighbor: src })
  }

  const datedNodes = nodes
    .filter(n => n.createdAt && (n.type === 'event' || n.type === 'article' || n.type === 'signal' || n.type === 'market_signal'))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

  if (datedNodes.length === 0) return []

  const entries: NarrativeEntry[] = []
  const mentionedIds = new Set<string>()
  let prevNodeId: string | null = null

  for (let i = 0; i < datedNodes.length; i++) {
    const node = datedNodes[i]
    if (mentionedIds.has(node.id)) continue
    mentionedIds.add(node.id)

    const date = node.createdAt!
    const connections = adjacency.get(node.id) ?? []
    const sourceIds = [node.id]

    let transition = ''
    if (prevNodeId && connections.some(c => c.neighbor.id === prevNodeId)) {
      const linkToPrev = connections.find(c => c.neighbor.id === prevNodeId)
      if (linkToPrev) {
        const etype = linkToPrev.edge.type
        if (etype === 'supports' || etype === 'updates') {
          transition = pickTransition(TRANSITIONS_CONFIRM, i) + ' '
        } else if (etype === 'affects' || etype === 'impacts' || etype === 'raises_probability_of' || etype === 'lowers_probability_of') {
          transition = pickTransition(TRANSITIONS_CAUSE, i) + ' '
        } else {
          transition = pickTransition(TRANSITIONS_SEQUENCE, i) + ' '
        }
      }
    } else if (i > 0) {
      transition = pickTransition(TRANSITIONS_SEQUENCE, i) + ' '
    }

    let text = ''

    if (node.type === 'event') {
      text = `${transition}le **${date}**, ${node.summary || node.label}.`

      const supportingSources = connections.filter(c =>
        (c.neighbor.type === 'article' || c.neighbor.type === 'signal') &&
        (c.edge.type === 'updates' || c.edge.type === 'supports') &&
        !mentionedIds.has(c.neighbor.id),
      ).sort((a, b) => (a.neighbor.createdAt ?? '').localeCompare(b.neighbor.createdAt ?? ''))

      if (supportingSources.length > 0) {
        const sourceTexts: string[] = []
        for (const s of supportingSources.slice(0, 3)) {
          mentionedIds.add(s.neighbor.id)
          sourceIds.push(s.neighbor.id)
          const explanation = s.edge.explanation ? ` — ${s.edge.explanation}` : ''
          sourceTexts.push(`« ${s.neighbor.label} »${explanation}`)
        }
        text += ` Sources : ${sourceTexts.join(' ; ')}.`
      }

      const probabilityImpacts = connections.filter(c =>
        c.neighbor.type === 'question' &&
        (c.edge.type === 'raises_probability_of' || c.edge.type === 'lowers_probability_of'),
      )
      if (probabilityImpacts.length > 0) {
        const impacts = probabilityImpacts.map(c => {
          const dir = c.edge.type === 'raises_probability_of' ? 'augmente' : 'diminue'
          const prob = c.neighbor.probability != null ? ` (${Math.round(c.neighbor.probability * 100)}%)` : ''
          return `${dir} la probabilité de « ${c.neighbor.label} »${prob}`
        })
        text += ` Cela ${impacts.join(' et ')}.`
      }

      const crossEventLinks = connections.filter(c =>
        c.neighbor.type === 'event' &&
        c.neighbor.id !== node.id &&
        (c.edge.type === 'affects' || c.edge.type === 'impacts' || c.edge.type === 'related_to'),
      )
      if (crossEventLinks.length > 0) {
        const links = crossEventLinks.map(c => {
          const explanation = c.edge.explanation || `lié à « ${c.neighbor.label} »`
          return explanation
        })
        text += ` Impact connexe : ${links.join('. ')}.`
      }
    } else if (node.type === 'article') {
      const linkedEvents = connections.filter(c =>
        c.neighbor.type === 'event' &&
        (c.edge.type === 'updates' || c.edge.type === 'supports'),
      )
      const explanation = connections.find(c => c.edge.explanation)?.edge.explanation

      if (linkedEvents.length > 0 && explanation) {
        text = `${transition}le **${date}**, selon « ${node.label} » : ${explanation}.`
      } else {
        text = `${transition}le **${date}**, ${node.summary || node.label}.`
      }
    } else if (node.type === 'signal' || node.type === 'market_signal') {
      const linkedItems = connections.filter(c => c.edge.type === 'supports' || c.edge.type === 'updates')
      const explanation = connections.find(c => c.edge.explanation)?.edge.explanation

      if (explanation) {
        text = `${transition}le **${date}**, un signal clé est détecté : ${node.summary || node.label}. ${explanation}.`
      } else {
        text = `${transition}le **${date}**, ${node.summary || node.label}.`
      }

      if (node.probability != null) {
        text += ` Les marchés prédictifs évaluent la probabilité à **${Math.round(node.probability * 100)}%**.`
      }
    }

    if (text) {
      entries.push({ date, text: text.trim(), sourceIds })
    }

    prevNodeId = node.id
  }

  const questions = nodes.filter(n => n.type === 'question')
  if (questions.length > 0) {
    const qTexts = questions
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
      .map(q => {
        const prob = q.probability != null ? `**${Math.round(q.probability * 100)}%**` : '?'
        const drivers = (adjacency.get(q.id) ?? [])
          .filter(c => c.edge.type === 'raises_probability_of' || c.edge.type === 'lowers_probability_of')
          .map(c => {
            const arrow = c.edge.type === 'raises_probability_of' ? '↑' : '↓'
            return `${arrow} ${c.neighbor.label}`
          })
        const driverText = drivers.length > 0 ? ` (facteurs : ${drivers.join(', ')})` : ''
        return `« ${q.label} » — ${prob}${driverText}`
      })

    entries.push({
      date: '',
      text: `**Où en sont les prévisions ?** ${qTexts.join('. ')}.`,
      sourceIds: questions.map(q => q.id),
    })
  }

  return entries
}

// ── Rendering helpers ─────────────────────────────────────────────────────────

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-')
  const months: Record<string, string> = {
    '01': 'Janvier', '02': 'Février', '03': 'Mars', '04': 'Avril',
    '05': 'Mai', '06': 'Juin', '07': 'Juillet', '08': 'Août',
    '09': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre',
  }
  return `${months[m] ?? m} ${y}`
}

function renderMarkdownBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-neutral-100">{part.slice(2, -2)}</strong>
    }
    return <span key={i}>{part}</span>
  })
}

function renderSourcePills(
  sourceIds: string[],
  nodes: IntelligenceGraphNode[],
  onNodeSelect: (id: string) => void,
) {
  const nodesMap = new Map(nodes.map(n => [n.id, n]))
  const sources = sourceIds.map(id => nodesMap.get(id)).filter(Boolean) as IntelligenceGraphNode[]
  if (sources.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {sources.map(s => {
        const cfg = NODE_TYPE_CONFIG[s.type]
        return (
          <button
            key={s.id}
            onClick={() => onNodeSelect(s.id)}
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border transition-colors hover:opacity-80 ${cfg.bgClass} ${cfg.borderClass} ${cfg.textClass}`}
          >
            <span>{cfg.icon}</span>
            <span className="max-w-[180px] truncate">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TimelinePanel({ nodes, edges, query, selectedNodeId, onNodeSelect }: TimelinePanelProps) {
  const narrative = buildChronologicalNarrative(nodes, edges, query)

  const dated = nodes
    .filter(n => n.createdAt)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))

  const grouped = new Map<string, IntelligenceGraphNode[]>()
  for (const n of dated) {
    const month = n.createdAt!.slice(0, 7)
    const arr = grouped.get(month) ?? []
    arr.push(n)
    grouped.set(month, arr)
  }

  if (narrative.length === 0 && dated.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600 text-xs">
        Aucun élément daté dans les résultats
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-12 space-y-6">
      {/* Chronological narrative */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <span className="text-sm">📖</span>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-neutral-200">Récit chronologique — « {query} »</h3>
            <p className="text-[10px] text-neutral-500">Comment les événements s'enchaînent et s'influencent</p>
          </div>
        </div>
        <div className="space-y-4">
          {narrative.map((entry, i) => (
            <div key={i}>
              <p className="text-[13px] text-neutral-300 leading-[1.7]">
                {renderMarkdownBold(entry.text)}
              </p>
              {renderSourcePills(entry.sourceIds, nodes, onNodeSelect)}
            </div>
          ))}
        </div>
      </div>

      {/* Detailed timeline */}
      <div>
        <h3 className="text-[12px] font-bold text-neutral-400 uppercase tracking-wider mb-4">Chronologie détaillée</h3>
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([month, items]) => (
            <div key={month}>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px flex-1 bg-neutral-800" />
                <span className="text-[12px] font-bold text-neutral-300 px-2">{formatMonth(month)}</span>
                <div className="h-px flex-1 bg-neutral-800" />
              </div>
              <div className="space-y-1.5 border-l-2 border-neutral-800 ml-3 pl-4">
                {items.map(n => {
                  const cfg = NODE_TYPE_CONFIG[n.type]
                  const relatedEdges = edges.filter(e => e.source === n.id || e.target === n.id)
                  const explanations = relatedEdges
                    .filter(e => e.explanation)
                    .slice(0, 2)
                    .map(e => e.explanation!)

                  return (
                    <button
                      key={n.id}
                      onClick={() => onNodeSelect(n.id)}
                      className={`w-full text-left px-3 py-3 rounded-lg transition-colors relative group ${
                        selectedNodeId === n.id
                          ? 'bg-blue-500/10 border border-blue-500/30'
                          : 'hover:bg-neutral-900/60 border border-transparent'
                      }`}
                    >
                      <div className="absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full border-2 border-neutral-700 group-hover:border-blue-500 transition-colors" style={{ backgroundColor: cfg.color }} />
                      <div className="flex items-start gap-2.5">
                        <span className="text-base mt-0.5 flex-shrink-0">{cfg.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-neutral-200 group-hover:text-blue-300 transition-colors leading-snug">
                            {n.label}
                          </div>
                          {n.summary && (
                            <p className="text-[12px] text-neutral-500 mt-1 line-clamp-2 leading-relaxed">{n.summary}</p>
                          )}
                          {explanations.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {explanations.map((exp, i) => (
                                <p key={i} className="text-[11px] text-blue-400/70 italic">→ {exp}</p>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-neutral-600">{n.createdAt}</span>
                            <span className={`text-[10px] font-semibold uppercase ${cfg.textClass}`}>{cfg.label}</span>
                            {n.probability != null && (
                              <span className="text-[10px] font-bold text-violet-400">{Math.round(n.probability * 100)}%</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
