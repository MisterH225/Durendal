// ============================================================================
// EventNormalizationService
// Transforms candidate articles/signals into normalized event objects.
// Handles deduplication, merging, and summary generation.
// ============================================================================

import { callGemini } from '@/lib/ai/gemini'
import type { RankedCandidate, NormalizedEvent, SourceEvidence } from '../types'

export interface NormalizationResult {
  events: NormalizedEvent[]
  evidenceMap: Map<string, SourceEvidence[]>
}

function generateDedupHash(title: string, date?: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  const datePrefix = date ? date.slice(0, 7) : 'unknown'
  return `${datePrefix}::${normalized}`
}

/**
 * Batch-normalize a set of ranked candidates into events using Gemini.
 * Groups similar candidates into the same event to avoid duplication.
 */
export async function normalizeEvents(
  candidates: RankedCandidate[],
): Promise<NormalizationResult> {
  if (candidates.length === 0) return { events: [], evidenceMap: new Map() }

  // Group candidates by rough similarity for batch processing
  const groups = groupSimilarCandidates(candidates)
  const events: NormalizedEvent[] = []
  const evidenceMap = new Map<string, SourceEvidence[]>()

  for (const group of groups) {
    try {
      const { event, evidence } = await normalizeGroup(group)
      if (event) {
        events.push(event)
        evidenceMap.set(event.id, evidence)
      }
    } catch (err) {
      console.warn('[event-normalization] Group normalization failed:', err)
      // Fallback: create a simple event from the top candidate
      const top = group[0]
      const fallbackEvent = createFallbackEvent(top)
      events.push(fallbackEvent)
      evidenceMap.set(fallbackEvent.id, group.map(c => candidateToEvidence(c)))
    }
  }

  return { events, evidenceMap }
}

function groupSimilarCandidates(candidates: RankedCandidate[]): RankedCandidate[][] {
  const groups: RankedCandidate[][] = []
  const assigned = new Set<number>()

  for (let i = 0; i < candidates.length; i++) {
    if (assigned.has(i)) continue
    const group = [candidates[i]]
    assigned.add(i)

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned.has(j)) continue
      if (areSimilarCandidates(candidates[i], candidates[j])) {
        group.push(candidates[j])
        assigned.add(j)
      }
    }

    groups.push(group)
  }

  return groups
}

function areSimilarCandidates(a: RankedCandidate, b: RankedCandidate): boolean {
  // Same URL
  if (a.url && b.url && a.url === b.url) return true

  // High title token overlap
  const tokensA = new Set(a.title.toLowerCase().split(/\s+/).filter(t => t.length >= 3))
  const tokensB = new Set(b.title.toLowerCase().split(/\s+/).filter(t => t.length >= 3))
  if (tokensA.size === 0 || tokensB.size === 0) return false

  let overlap = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++
  }
  return overlap / Math.min(tokensA.size, tokensB.size) > 0.7
}

async function normalizeGroup(
  group: RankedCandidate[],
): Promise<{ event: NormalizedEvent | null; evidence: SourceEvidence[] }> {
  const top = group[0]
  const titles = group.map(c => c.title).join('\n- ')
  const snippets = group.map(c => c.snippet).filter(Boolean).join('\n')

  const prompt = `Normalise ces articles/signaux en UN événement structuré.

Articles:
- ${titles}

Extraits: ${snippets.slice(0, 2000)}

Retourne un JSON strict:
{
  "title": "titre court et factuel de l'événement",
  "summary": "résumé de 2-3 phrases",
  "eventType": "policy_change|conflict|market_move|election|economic_data|regulation|corporate_action|crisis|diplomacy|infrastructure|social_movement|technology|other",
  "who": ["acteur1", "acteur2"],
  "what": "description de l'action/événement",
  "when": "YYYY-MM-DD si connu, sinon null",
  "where": ["pays/région"],
  "why": "cause ou contexte si disponible",
  "sectors": ["secteur1"],
  "importance": 1-10,
  "confidence": 0.0-1.0
}
Retourne uniquement le JSON.`

  try {
    const { text } = await callGemini(prompt, { temperature: 0.1, maxOutputTokens: 1000 })
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { event: null, evidence: group.map(candidateToEvidence) }

    const parsed = JSON.parse(jsonMatch[0])
    const eventId = crypto.randomUUID()

    const event: NormalizedEvent = {
      id: eventId,
      title: parsed.title ?? top.title,
      summary: parsed.summary,
      eventType: parsed.eventType ?? 'other',
      who: parsed.who ?? [],
      what: parsed.what,
      happenedAt: parsed.when ?? top.publishedAt,
      whereGeo: parsed.where ?? [],
      why: parsed.why,
      sectors: parsed.sectors ?? [],
      tags: [],
      confidence: Math.min(Math.max(parsed.confidence ?? 0.7, 0), 1),
      importance: Math.min(Math.max(parsed.importance ?? 5, 0), 10),
      dedupHash: generateDedupHash(parsed.title ?? top.title, parsed.when ?? top.publishedAt),
      sourceOrigin: top.source === 'platform_signal' || top.source === 'platform_event'
        ? 'platform'
        : 'external_retrieval',
    }

    return { event, evidence: group.map(candidateToEvidence) }
  } catch {
    return { event: createFallbackEvent(top), evidence: group.map(candidateToEvidence) }
  }
}

function createFallbackEvent(candidate: RankedCandidate): NormalizedEvent {
  return {
    id: crypto.randomUUID(),
    title: candidate.title,
    summary: candidate.snippet,
    eventType: 'other',
    who: candidate.entityOverlap,
    happenedAt: candidate.publishedAt,
    whereGeo: candidate.regionOverlap,
    sectors: candidate.sectorOverlap,
    confidence: 0.5,
    importance: 5,
    dedupHash: generateDedupHash(candidate.title, candidate.publishedAt),
    sourceOrigin: candidate.source.startsWith('platform') ? 'platform' : 'external_retrieval',
  }
}

function candidateToEvidence(candidate: RankedCandidate): SourceEvidence {
  return {
    url: candidate.url,
    title: candidate.title,
    excerpt: candidate.snippet?.slice(0, 500),
    publishedAt: candidate.publishedAt,
    trustScore: candidate.trustScore,
    platformType: candidate.source === 'platform_signal' ? 'signal_feed'
      : candidate.source === 'external_signal' ? 'external_signal'
      : undefined,
    platformId: candidate.sourceId,
  }
}
