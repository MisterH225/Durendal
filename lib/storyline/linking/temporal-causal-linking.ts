// ============================================================================
// TemporalLinkingService + CausalLinkingService + CorollaryDetectionService
// Determines temporal, causal, and corollary relations between events.
// Uses a combination of heuristic signals and AI inference.
// ============================================================================

import { callGemini } from '@/lib/ai/gemini'
import type { NormalizedEvent, EventRelation, StorylineAnchor } from '../types'

// ── Temporal linking ─────────────────────────────────────────────────────────

export function detectTemporalRelations(
  events: NormalizedEvent[],
  anchor: StorylineAnchor,
): EventRelation[] {
  const relations: EventRelation[] = []
  const anchorDate = anchor.publishedAt ? new Date(anchor.publishedAt) : new Date()

  // Sort events by date
  const dated = events
    .filter(e => e.happenedAt)
    .sort((a, b) => new Date(a.happenedAt!).getTime() - new Date(b.happenedAt!).getTime())

  for (const event of dated) {
    const eventDate = new Date(event.happenedAt!)
    const deltaDays = Math.round((eventDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24))

    // Link consecutive events in the timeline
    const idx = dated.indexOf(event)
    if (idx > 0) {
      const prev = dated[idx - 1]
      const prevDate = new Date(prev.happenedAt!)
      const gap = Math.round((eventDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))

      // Entity continuity between consecutive events boosts confidence
      const sharedEntities = (event.who ?? []).filter(
        w => (prev.who ?? []).some(pw => pw.toLowerCase() === w.toLowerCase()),
      )
      const entityBonus = Math.min(sharedEntities.length * 0.1, 0.3)

      // Same geography bonus
      const sharedGeo = (event.whereGeo ?? []).filter(
        g => (prev.whereGeo ?? []).some(pg => pg.toLowerCase() === g.toLowerCase()),
      )
      const geoBonus = sharedGeo.length > 0 ? 0.1 : 0

      const confidence = Math.min(0.4 + entityBonus + geoBonus, 0.95)

      relations.push({
        sourceEventId: prev.id,
        targetEventId: event.id,
        relationType: 'predecessor',
        confidence,
        explanation: `Événement précédent (${Math.abs(gap)} jours avant)`,
        timeDeltaDays: gap,
      })
    }
  }

  return relations
}

// ── AI-powered causal and corollary detection ────────────────────────────────

export async function detectCausalAndCorollaryRelations(
  events: NormalizedEvent[],
  anchorEvent: NormalizedEvent,
): Promise<EventRelation[]> {
  if (events.length < 2) return []

  const eventSummaries = events.map(e => ({
    id: e.id,
    title: e.title,
    date: e.happenedAt ?? 'unknown',
    type: e.eventType,
    who: e.who?.join(', '),
    where: e.whereGeo?.join(', '),
  }))

  const prompt = `Analyse ces événements et identifie les relations causales et corolaires par rapport à l'événement ancre.

ÉVÉNEMENT ANCRE:
- Titre: ${anchorEvent.title}
- Date: ${anchorEvent.happenedAt ?? 'unknown'}
- Résumé: ${anchorEvent.summary ?? ''}

AUTRES ÉVÉNEMENTS:
${eventSummaries.map(e => `- [${e.id}] ${e.title} (${e.date}) — ${e.type} — ${e.who} — ${e.where}`).join('\n')}

Pour chaque relation trouvée, indique:
- source_id: ID de l'événement source
- target_id: ID de l'événement cible
- type: causes | caused_by | corollary | response_to | spillover | escalation | de_escalation | parallel
- confidence: 0.0-1.0 (sois CONSERVATEUR — ne surclaime pas la causalité)
- explanation: explication courte

RÈGLES CRITIQUES:
- NE PAS surestimer la causalité. Si le lien est seulement thématique, utilise "parallel" ou ne l'inclus pas.
- confidence > 0.7 uniquement si le lien causal est explicite et évident
- confidence 0.4-0.7 pour les liens probables mais non certains
- confidence < 0.4 pour les liens suggérés/spéculatifs

Retourne un JSON strict:
{"relations": [{"source_id": "...", "target_id": "...", "type": "...", "confidence": 0.0, "explanation": "..."}]}
Retourne uniquement le JSON.`

  try {
    const { text } = await callGemini(prompt, {
      temperature: 0.15,
      maxOutputTokens: 3000,
    })

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0])
    const eventIds = new Set(events.map(e => e.id))

    return (parsed.relations ?? [])
      .filter((r: any) =>
        r.source_id && r.target_id && r.type &&
        eventIds.has(r.source_id) && eventIds.has(r.target_id) &&
        r.source_id !== r.target_id,
      )
      .map((r: any): EventRelation => ({
        sourceEventId: r.source_id,
        targetEventId: r.target_id,
        relationType: validateRelationType(r.type),
        confidence: Math.min(Math.max(r.confidence ?? 0.4, 0), 1),
        explanation: r.explanation,
      }))
  } catch (err) {
    console.warn('[linking] Causal/corollary detection failed:', err)
    return []
  }
}

function validateRelationType(type: string): EventRelation['relationType'] {
  const valid: EventRelation['relationType'][] = [
    'causes', 'caused_by', 'corollary', 'response_to',
    'spillover', 'escalation', 'de_escalation', 'parallel',
    'predecessor', 'successor',
  ]
  return valid.includes(type as any) ? (type as EventRelation['relationType']) : 'parallel'
}

// ── Combined linking pipeline ────────────────────────────────────────────────

export async function detectAllRelations(
  events: NormalizedEvent[],
  anchorEvent: NormalizedEvent,
  anchor: StorylineAnchor,
): Promise<EventRelation[]> {
  // Temporal relations (heuristic, fast)
  const temporalRelations = detectTemporalRelations(events, anchor)

  // Causal + corollary relations (AI-powered)
  const causalRelations = await detectCausalAndCorollaryRelations(events, anchorEvent)

  // Merge and deduplicate
  const allRelations = [...temporalRelations, ...causalRelations]
  const seen = new Set<string>()
  const deduplicated: EventRelation[] = []

  for (const rel of allRelations) {
    const key = `${rel.sourceEventId}::${rel.targetEventId}::${rel.relationType}`
    if (!seen.has(key)) {
      seen.add(key)
      deduplicated.push(rel)
    }
  }

  return deduplicated
}
