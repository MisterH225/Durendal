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

function buildNarrative(
  nodes: IntelligenceGraphNode[],
  edges: IntelligenceGraphEdge[],
  query: string,
): string[] {
  const nodesMap = new Map(nodes.map(n => [n.id, n]))
  const events = nodes.filter(n => n.type === 'event').sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
  const questions = nodes.filter(n => n.type === 'question')
  const signals = nodes.filter(n => n.type === 'signal' || n.type === 'market_signal')
  const entities = nodes.filter(n => n.type === 'entity')

  const paragraphs: string[] = []

  if (events.length === 0 && questions.length === 0) {
    paragraphs.push(`La recherche "${query}" a retourné ${nodes.length} éléments sans événement structurant identifié.`)
    return paragraphs
  }

  const entityNames = entities.slice(0, 5).map(e => e.label).join(', ')
  const intro = events.length > 0
    ? `La recherche « ${query} » révèle ${events.length} événement${events.length > 1 ? 's' : ''} structurant${events.length > 1 ? 's' : ''}, ${signals.length} signal${signals.length > 1 ? 'aux' : ''} et ${questions.length} question${questions.length > 1 ? 's' : ''} prédictive${questions.length > 1 ? 's' : ''}.`
    : `La recherche « ${query} » a identifié ${questions.length} question${questions.length > 1 ? 's' : ''} prédictive${questions.length > 1 ? 's' : ''} et ${signals.length} signal${signals.length > 1 ? 'aux' : ''}.`

  if (entityNames) {
    paragraphs.push(`${intro} Les acteurs clés impliqués sont : ${entityNames}.`)
  } else {
    paragraphs.push(intro)
  }

  for (const event of events) {
    const relatedEdges = edges.filter(e => e.source === event.id || e.target === event.id)
    const supportingSignals: string[] = []
    const impactedQuestions: string[] = []
    const causalLinks: string[] = []

    for (const edge of relatedEdges) {
      const neighborId = edge.source === event.id ? edge.target : edge.source
      const neighbor = nodesMap.get(neighborId)
      if (!neighbor) continue

      if (edge.type === 'raises_probability_of' || edge.type === 'lowers_probability_of') {
        const direction = edge.type === 'raises_probability_of' ? 'augmente' : 'diminue'
        const prob = neighbor.probability != null ? ` (actuellement ${Math.round(neighbor.probability * 100)}%)` : ''
        impactedQuestions.push(`${direction} la probabilité de « ${neighbor.label} »${prob}`)
      } else if ((edge.type === 'supports' || edge.type === 'updates') && (neighbor.type === 'signal' || neighbor.type === 'article')) {
        supportingSignals.push(neighbor.label)
      } else if (edge.type === 'affects' || edge.type === 'impacts') {
        if (neighbor.type === 'event') {
          causalLinks.push(`${edge.explanation || `est lié à « ${neighbor.label} »`}`)
        }
      }
    }

    let eventParagraph = `**${event.label}**`
    if (event.createdAt) eventParagraph += ` (${event.createdAt})`
    eventParagraph += ` — ${event.summary || 'Événement identifié dans le graphe intelligence.'}`

    if (supportingSignals.length > 0) {
      eventParagraph += ` Cette dynamique est appuyée par ${supportingSignals.length} signal${supportingSignals.length > 1 ? 'aux' : ''} : ${supportingSignals.slice(0, 3).join(' ; ')}${supportingSignals.length > 3 ? '...' : ''}.`
    }

    if (impactedQuestions.length > 0) {
      eventParagraph += ` Cet événement ${impactedQuestions.join(' et ')}.`
    }

    if (causalLinks.length > 0) {
      eventParagraph += ` Connexion causale : ${causalLinks.join('. ')}.`
    }

    paragraphs.push(eventParagraph)
  }

  const crossCluster = edges.filter(e => {
    const src = nodesMap.get(e.source)
    const tgt = nodesMap.get(e.target)
    if (!src || !tgt) return false
    return src.type === 'event' && tgt.type === 'event' && (e.type === 'affects' || e.type === 'related_to')
  })

  if (crossCluster.length > 0) {
    const links = crossCluster.map(e => {
      const src = nodesMap.get(e.source)!
      const tgt = nodesMap.get(e.target)!
      return e.explanation || `« ${src.label} » ${EDGE_TYPE_CONFIG[e.type].label.toLowerCase()} « ${tgt.label} »`
    })
    paragraphs.push(`**Connexions inter-événements** — ${links.join('. ')}.`)
  }

  if (questions.length > 0) {
    const qSummary = questions
      .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
      .slice(0, 4)
      .map(q => `« ${q.label} » à ${Math.round((q.probability ?? 0) * 100)}%`)
      .join(' ; ')
    paragraphs.push(`**Questions prédictives clés** — ${qSummary}.`)
  }

  return paragraphs
}

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

export function TimelinePanel({ nodes, edges, query, selectedNodeId, onNodeSelect }: TimelinePanelProps) {
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

  const narrative = buildNarrative(nodes, edges, query)

  if (dated.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-neutral-600 text-xs">
        Aucun élément daté dans les résultats
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-12 space-y-6">
      {/* Narrative */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
            <span className="text-xs">📖</span>
          </div>
          <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">Récit intelligence</h3>
        </div>
        <div className="space-y-2.5">
          {narrative.map((p, i) => (
            <p key={i} className="text-[12px] text-neutral-400 leading-relaxed">
              {renderMarkdownBold(p)}
            </p>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([month, items]) => (
          <div key={month}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-neutral-800" />
              <span className="text-[11px] font-bold text-neutral-300 px-2">{formatMonth(month)}</span>
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
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors relative group ${
                      selectedNodeId === n.id
                        ? 'bg-blue-500/10 border border-blue-500/30'
                        : 'hover:bg-neutral-900/60 border border-transparent'
                    }`}
                  >
                    <div className="absolute -left-[21px] top-4 w-2.5 h-2.5 rounded-full border-2 border-neutral-700 group-hover:border-blue-500 transition-colors" style={{ backgroundColor: cfg.color }} />
                    <div className="flex items-start gap-2.5">
                      <span className="text-sm mt-0.5 flex-shrink-0">{cfg.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-neutral-200 group-hover:text-blue-300 transition-colors leading-snug">
                          {n.label}
                        </div>
                        {n.summary && (
                          <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{n.summary}</p>
                        )}
                        {explanations.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {explanations.map((exp, i) => (
                              <p key={i} className="text-[10px] text-blue-400/60 italic">→ {exp}</p>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[9px] text-neutral-600">{n.createdAt}</span>
                          <span className={`text-[9px] font-semibold uppercase ${cfg.textClass}`}>{cfg.label}</span>
                          {n.probability != null && (
                            <span className="text-[9px] font-bold text-violet-400">{Math.round(n.probability * 100)}%</span>
                          )}
                          {relatedEdges.length > 0 && (
                            <span className="text-[9px] text-neutral-600">{relatedEdges.length} connexion{relatedEdges.length > 1 ? 's' : ''}</span>
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
  )
}
