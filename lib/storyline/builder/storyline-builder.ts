// ============================================================================
// StorylineBuilderService
// Main orchestrator: input → retrieval → ranking → normalization → linking →
// outcomes → card projection → storyline.
// ============================================================================

import { callGemini, callGeminiWithSearch } from '@/lib/ai/gemini'
import { extractEntities, resolveEntities } from '../extraction/entity-resolution'
import { normalizeEvents } from '../extraction/event-normalization'
import { hybridRetrieve } from '../retrieval/hybrid-retrieval'
import { rankCandidates } from '../ranking/candidate-ranking'
import { detectAllRelations } from '../linking/temporal-causal-linking'
import { generateOutcomes, outcomesToCards } from '../outcomes/outcome-generation'
import {
  DEFAULT_BUILD_OPTIONS,
  TIME_WINDOW_CONFIGS,
} from '../types'
import type {
  StorylineInput,
  StorylineAnchor,
  StorylineBuildOptions,
  StorylineBuildResult,
  Storyline,
  StorylineCard,
  StorylineEdge,
  NormalizedEvent,
  EventRelation,
  SourceEvidence,
  RetrievalTimeWindow,
} from '../types'

// ── Anchor resolution ────────────────────────────────────────────────────────

async function resolveAnchorFromUrl(url: string): Promise<StorylineAnchor> {
  // Use Gemini with grounding to extract article content
  const prompt = `Analyse cet article: ${url}

Retourne un JSON strict:
{
  "title": "titre de l'article",
  "summary": "résumé en 3-4 phrases",
  "publishedAt": "YYYY-MM-DD si disponible",
  "entities": ["entité1", "entité2"],
  "regions": ["pays/région"],
  "sectors": ["secteur"],
  "keywords": ["mot-clé1", "mot-clé2", "mot-clé3"]
}
Retourne uniquement le JSON.`

  const { text } = await callGeminiWithSearch(prompt, { maxOutputTokens: 1500 })

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: parsed.title ?? url,
        summary: parsed.summary ?? '',
        url,
        publishedAt: parsed.publishedAt,
        entities: parsed.entities ?? [],
        regions: parsed.regions ?? [],
        sectors: parsed.sectors ?? [],
        keywords: parsed.keywords ?? [],
      }
    }
  } catch {
    // Parsing failed
  }

  return {
    title: url,
    summary: '',
    url,
    entities: [],
    regions: [],
    sectors: [],
    keywords: [url.split('/').pop()?.replace(/[-_]/g, ' ') ?? ''],
  }
}

async function resolveAnchorFromKeyword(keyword: string): Promise<StorylineAnchor> {
  const { text } = await callGeminiWithSearch(
    `Quel est le sujet principal de "${keyword}" dans l'actualité récente, en particulier pour les marchés africains ?
    
Retourne un JSON:
{
  "title": "titre factuel du sujet principal",
  "summary": "résumé de 3-4 phrases du contexte actuel",
  "publishedAt": "YYYY-MM-DD approximatif",
  "entities": ["entité1", "entité2"],
  "regions": ["pays/région"],
  "sectors": ["secteur"],
  "keywords": ["${keyword}", "mot-clé2", "mot-clé3"]
}
Retourne uniquement le JSON.`,
    { maxOutputTokens: 1500 },
  )

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        title: parsed.title ?? keyword,
        summary: parsed.summary ?? '',
        publishedAt: parsed.publishedAt,
        entities: parsed.entities ?? [],
        regions: parsed.regions ?? [],
        sectors: parsed.sectors ?? [],
        keywords: parsed.keywords ?? [keyword],
      }
    }
  } catch {
    // Parsing failed
  }

  return {
    title: keyword,
    summary: '',
    entities: [],
    regions: [],
    sectors: [],
    keywords: [keyword],
  }
}

async function resolveAnchor(input: StorylineInput): Promise<StorylineAnchor> {
  switch (input.type) {
    case 'url':
      return resolveAnchorFromUrl(input.value)

    case 'keyword':
      return resolveAnchorFromKeyword(input.value)

    case 'article_id': {
      // Load from platform
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()

      // Try forecast_signal_feed first
      const { data: signal } = await db
        .from('forecast_signal_feed')
        .select('id, title, summary, region, data, created_at')
        .eq('id', input.value)
        .single()

      if (signal) {
        const extraction = await extractEntities(signal.title ?? '', signal.summary ?? '')
        return {
          title: signal.title ?? '',
          summary: signal.summary ?? '',
          url: signal.data?.source_url ?? signal.data?.url ?? undefined,
          publishedAt: signal.created_at,
          entities: extraction.entities.map(e => e.canonicalName),
          regions: extraction.regions,
          sectors: extraction.sectors,
          keywords: extraction.keywords,
        }
      }

      // Try external_signals
      const { data: ext } = await db
        .from('external_signals')
        .select('id, title, summary, url, published_at, geography, category_tags')
        .eq('id', input.value)
        .single()

      if (ext) {
        const extraction = await extractEntities(ext.title ?? '', ext.summary ?? '')
        return {
          title: ext.title ?? '',
          summary: ext.summary ?? '',
          url: ext.url ?? undefined,
          publishedAt: ext.published_at,
          entities: extraction.entities.map(e => e.canonicalName),
          regions: ext.geography ?? [],
          sectors: ext.category_tags ?? [],
          keywords: extraction.keywords,
        }
      }

      return resolveAnchorFromKeyword(input.value)
    }

    case 'event_id': {
      const { createAdminClient } = await import('@/lib/supabase/admin')
      const db = createAdminClient()

      const { data: ev } = await db
        .from('forecast_events')
        .select('id, title, description, tags, created_at')
        .eq('id', input.value)
        .single()

      if (ev) {
        const extraction = await extractEntities(ev.title ?? '', ev.description ?? '')
        return {
          title: ev.title ?? '',
          summary: ev.description ?? '',
          publishedAt: ev.created_at,
          entities: extraction.entities.map(e => e.canonicalName),
          regions: extraction.regions,
          sectors: ev.tags ?? [],
          keywords: extraction.keywords,
        }
      }

      return resolveAnchorFromKeyword(input.value)
    }

    default:
      return resolveAnchorFromKeyword(input.value)
  }
}

// ── Storyline construction from events + relations ───────────────────────────

function buildStorylineCards(
  anchorEvent: NormalizedEvent,
  events: NormalizedEvent[],
  relations: EventRelation[],
  evidenceMap: Map<string, SourceEvidence[]>,
  storylineId: string,
): { cards: StorylineCard[]; edges: StorylineEdge[] } {
  const cards: StorylineCard[] = []
  const edges: StorylineEdge[] = []

  // Build relation graph
  const predecessors: NormalizedEvent[] = []
  const successors: NormalizedEvent[] = []
  const corollaries: NormalizedEvent[] = []
  const context: NormalizedEvent[] = []

  const relationMap = new Map<string, EventRelation[]>()
  for (const rel of relations) {
    const key = `${rel.sourceEventId}::${rel.targetEventId}`
    if (!relationMap.has(key)) relationMap.set(key, [])
    relationMap.get(key)!.push(rel)
  }

  const categorized = new Set<string>()
  categorized.add(anchorEvent.id)

  // Classify events based on their relation to the anchor
  for (const event of events) {
    if (event.id === anchorEvent.id) continue

    const relsAsSource = relations.filter(r => r.sourceEventId === event.id && r.targetEventId === anchorEvent.id)
    const relsAsTarget = relations.filter(r => r.sourceEventId === anchorEvent.id && r.targetEventId === event.id)
    const allRels = [...relsAsSource, ...relsAsTarget]

    const hasPredecessor = allRels.some(r =>
      ['predecessor', 'causes', 'escalation'].includes(r.relationType),
    )
    const hasSuccessor = allRels.some(r =>
      ['successor', 'caused_by', 'de_escalation'].includes(r.relationType),
    )
    const hasCorollary = allRels.some(r =>
      ['corollary', 'spillover', 'response_to', 'parallel'].includes(r.relationType),
    )

    if (hasPredecessor) predecessors.push(event)
    else if (hasSuccessor) successors.push(event)
    else if (hasCorollary) corollaries.push(event)
    else {
      // Fall back to temporal position
      if (event.happenedAt && anchorEvent.happenedAt) {
        const delta = new Date(event.happenedAt).getTime() - new Date(anchorEvent.happenedAt).getTime()
        if (delta < 0) predecessors.push(event)
        else if (delta > 0) successors.push(event)
        else corollaries.push(event)
      } else {
        context.push(event)
      }
    }
  }

  // Sort predecessors by date (oldest first for trunk)
  predecessors.sort((a, b) => {
    const dateA = a.happenedAt ? new Date(a.happenedAt).getTime() : 0
    const dateB = b.happenedAt ? new Date(b.happenedAt).getTime() : 0
    return dateA - dateB
  })

  // Sort successors by date
  successors.sort((a, b) => {
    const dateA = a.happenedAt ? new Date(a.happenedAt).getTime() : 0
    const dateB = b.happenedAt ? new Date(b.happenedAt).getTime() : 0
    return dateA - dateB
  })

  // Build trunk: predecessors → anchor → successors
  let position = 0

  // Predecessor cards
  for (const pred of predecessors) {
    const cardId = crypto.randomUUID()
    cards.push({
      id: cardId,
      storylineId,
      eventId: pred.id,
      cardType: 'predecessor',
      trunkPosition: position++,
      label: pred.title,
      summary: pred.summary,
      happenedAt: pred.happenedAt,
      importance: pred.importance,
      confidence: pred.confidence,
      evidence: evidenceMap.get(pred.id) ?? [],
    })
  }

  // Anchor card
  const anchorCardId = crypto.randomUUID()
  const anchorPosition = position++
  cards.push({
    id: anchorCardId,
    storylineId,
    eventId: anchorEvent.id,
    cardType: 'anchor',
    trunkPosition: anchorPosition,
    label: anchorEvent.title,
    summary: anchorEvent.summary,
    happenedAt: anchorEvent.happenedAt,
    importance: 10,
    confidence: anchorEvent.confidence,
    evidence: evidenceMap.get(anchorEvent.id) ?? [],
  })

  // Successor cards
  for (const succ of successors) {
    const cardId = crypto.randomUUID()
    cards.push({
      id: cardId,
      storylineId,
      eventId: succ.id,
      cardType: 'successor',
      trunkPosition: position++,
      label: succ.title,
      summary: succ.summary,
      happenedAt: succ.happenedAt,
      importance: succ.importance,
      confidence: succ.confidence,
      evidence: evidenceMap.get(succ.id) ?? [],
    })
  }

  // Corollary cards (on branches)
  let branchIndex = 0
  for (const cor of corollaries) {
    const cardId = crypto.randomUUID()
    const branchId = `corollary-${branchIndex++}`
    cards.push({
      id: cardId,
      storylineId,
      eventId: cor.id,
      cardType: 'corollary',
      branchId,
      label: cor.title,
      summary: cor.summary,
      happenedAt: cor.happenedAt,
      importance: cor.importance,
      confidence: cor.confidence,
      evidence: evidenceMap.get(cor.id) ?? [],
    })

    // Edge from anchor to corollary
    edges.push({
      id: crypto.randomUUID(),
      storylineId,
      sourceCardId: anchorCardId,
      targetCardId: cardId,
      edgeType: 'corollary_of',
      confidence: 0.6,
      label: 'Événement corolaire',
    })
  }

  // Context cards (background, low priority)
  for (const ctx of context) {
    const cardId = crypto.randomUUID()
    cards.push({
      id: cardId,
      storylineId,
      eventId: ctx.id,
      cardType: 'context',
      branchId: 'context',
      label: ctx.title,
      summary: ctx.summary,
      happenedAt: ctx.happenedAt,
      importance: Math.min(ctx.importance, 4),
      confidence: ctx.confidence,
      evidence: evidenceMap.get(ctx.id) ?? [],
    })
  }

  // Build trunk edges (sequential along the main trunk)
  const trunkCards = cards
    .filter(c => c.trunkPosition !== undefined && c.trunkPosition !== null)
    .sort((a, b) => (a.trunkPosition ?? 0) - (b.trunkPosition ?? 0))

  for (let i = 0; i < trunkCards.length - 1; i++) {
    const source = trunkCards[i]
    const target = trunkCards[i + 1]

    // Determine edge type from event relations
    let edgeType: StorylineEdge['edgeType'] = 'leads_to'
    const eventRel = relations.find(
      r =>
        (r.sourceEventId === source.eventId && r.targetEventId === target.eventId) ||
        (r.sourceEventId === target.eventId && r.targetEventId === source.eventId),
    )
    if (eventRel) {
      if (eventRel.relationType === 'causes' || eventRel.relationType === 'caused_by') edgeType = 'causes'
      else if (eventRel.relationType === 'escalation') edgeType = 'triggers'
      else if (eventRel.relationType === 'response_to') edgeType = 'response_to'
    }

    edges.push({
      id: crypto.randomUUID(),
      storylineId,
      sourceCardId: source.id,
      targetCardId: target.id,
      edgeType,
      confidence: eventRel?.confidence ?? 0.5,
      label: eventRel?.explanation,
    })
  }

  return { cards, edges }
}

// ── Main build pipeline ──────────────────────────────────────────────────────

export async function buildStoryline(input: StorylineInput): Promise<StorylineBuildResult> {
  const opts = { ...DEFAULT_BUILD_OPTIONS, ...input.options }
  const storylineId = crypto.randomUUID()

  console.log(`[storyline] Building storyline for ${input.type}: ${input.value}`)

  // 1. Resolve anchor
  const anchor = await resolveAnchor(input)
  console.log(`[storyline] Anchor resolved: "${anchor.title}"`)

  // Enrich anchor with entity extraction if needed
  if (anchor.entities.length === 0 && anchor.title) {
    const extraction = await extractEntities(anchor.title, anchor.summary)
    anchor.entities = extraction.entities.map(e => e.canonicalName)
    if (anchor.regions.length === 0) anchor.regions = extraction.regions
    if (anchor.sectors.length === 0) anchor.sectors = extraction.sectors
    if (anchor.keywords.length === 0) anchor.keywords = extraction.keywords
  }

  // 2. Hybrid retrieval
  const candidates = await hybridRetrieve(anchor, TIME_WINDOW_CONFIGS)
  console.log(`[storyline] Retrieved ${candidates.length} candidates`)

  // 3. Rank and select
  const maxTotal = opts.maxPastEvents + opts.maxFutureOutcomes + opts.maxCorollaryBranches + 5
  const rankedCandidates = rankCandidates(candidates, anchor, maxTotal)
  console.log(`[storyline] Ranked to ${rankedCandidates.length} candidates`)

  // 4. Normalize events
  const { events, evidenceMap } = await normalizeEvents(rankedCandidates)
  console.log(`[storyline] Normalized ${events.length} events`)

  // 5. Create anchor event
  const anchorEvent: NormalizedEvent = {
    id: crypto.randomUUID(),
    title: anchor.title,
    summary: anchor.summary,
    happenedAt: anchor.publishedAt,
    whereGeo: anchor.regions,
    sectors: anchor.sectors,
    who: anchor.entities,
    confidence: 0.95,
    importance: 10,
    sourceOrigin: 'platform',
  }
  const allEvents = [anchorEvent, ...events]
  evidenceMap.set(anchorEvent.id, anchor.url ? [{
    url: anchor.url,
    title: anchor.title,
    trustScore: 0.9,
  }] : [])

  // 6. Detect relations
  const relations = await detectAllRelations(allEvents, anchorEvent, anchor)
  console.log(`[storyline] Detected ${relations.length} relations`)

  // 7. Build storyline cards and edges
  const { cards, edges } = buildStorylineCards(
    anchorEvent, allEvents, relations, evidenceMap, storylineId,
  )

  // 8. Generate outcome predictions
  const outcomes = await generateOutcomes(anchorEvent, allEvents, anchor, opts.maxFutureOutcomes)
  const { cards: outcomeCards, evidence: outcomeEvidence } = outcomesToCards(
    outcomes, storylineId, cards.filter(c => c.trunkPosition != null).length,
  )

  // Add outcome edges (from last trunk card to outcomes)
  const lastTrunkCard = cards
    .filter(c => c.trunkPosition != null)
    .sort((a, b) => (b.trunkPosition ?? 0) - (a.trunkPosition ?? 0))[0]

  const outcomeEdges: StorylineEdge[] = []
  if (lastTrunkCard) {
    for (const oc of outcomeCards) {
      outcomeEdges.push({
        id: crypto.randomUUID(),
        storylineId,
        sourceCardId: lastTrunkCard.id,
        targetCardId: oc.id,
        edgeType: 'may_lead_to',
        confidence: oc.probability ?? 0.5,
        label: `${Math.round((oc.probability ?? 0.5) * 100)}%`,
      })
    }
  }

  // Merge outcome evidence into main evidence map
  for (const [cardId, ev] of outcomeEvidence.entries()) {
    evidenceMap.set(cardId, ev)
  }

  // 9. Assemble storyline
  const allCards = [...cards, ...outcomeCards]
  const allEdges = [...edges, ...outcomeEdges]

  const storyline: Storyline = {
    id: storylineId,
    userId: input.userId,
    title: anchor.title,
    description: anchor.summary,
    anchorEventId: anchorEvent.id,
    inputType: input.type,
    inputValue: input.value,
    status: 'active',
    region: anchor.regions[0],
    sectors: anchor.sectors,
    tags: anchor.keywords,
    version: 1,
    cards: allCards,
    edges: allEdges,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  // Compute stats
  const timeWindowBreakdown: Record<RetrievalTimeWindow, number> = {
    immediate: 0, recent: 0, medium: 0, long: 0, archival: 0,
  }
  for (const c of rankedCandidates) {
    if (c.timeWindow) timeWindowBreakdown[c.timeWindow]++
  }

  console.log(`[storyline] Build complete: ${allCards.length} cards, ${allEdges.length} edges`)

  return {
    storyline,
    stats: {
      candidatesRetrieved: candidates.length,
      candidatesRanked: rankedCandidates.length,
      eventsNormalized: events.length,
      relationsDetected: relations.length,
      outcomesGenerated: outcomes.length,
      timeWindowBreakdown,
    },
  }
}

// Re-export for convenience
export { resolveAnchor }
export type { StorylineInput }
