import type { StorylineSSEEvent, StorylineCard, StorylineResult, CandidateItem } from '@/lib/graph/types'
import { retrieveInternalCandidates, retrieveExternalCandidates } from './services/hybrid-retrieval'
import type { AnchorContext } from './services/hybrid-retrieval'
import { rankAndPruneCandidates } from './services/candidate-ranking'
import { extractEventsFromCandidates } from './services/article-extractor'
import { clusterEvents, reclusterMerged } from './services/event-clusterer'
import { detectRecencyBias } from './services/recency-bias-detector'
import { searchHistoricalContext } from './services/historical-searcher'
import {
  buildTemporalRelations,
  detectCausalRelations,
  detectCorollaryRelations,
  applyCounterfactualChecks,
} from './services/relation-detector'
import { generateOutcomes } from './services/outcome-generator'
import { assembleStorylineGraph } from './services/storyline-assembler'
import { generateNarrative } from './services/narrative-generator'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export type { AnchorContext }

export async function resolveAnchor(input: {
  query?: string
  articleId?: string
}): Promise<AnchorContext> {
  if (input.articleId) {
    const db = createAdminClient()

    const { data: signal } = await db
      .from('forecast_signal_feed')
      .select('id, title, summary, region, created_at, data')
      .eq('id', input.articleId)
      .single()

    if (signal) {
      const d = signal.data as Record<string, unknown> | null
      const pubDate = d?.published_at ?? d?.pubDate ?? d?.pub_date
      return {
        title: signal.title,
        summary: signal.summary,
        keywords: extractKeywords(signal.title, signal.summary),
        date: pubDate ? String(pubDate).slice(0, 10) : signal.created_at?.slice(0, 10),
        url: typeof d?.source_url === 'string' ? d.source_url : undefined,
        platformRefType: 'signal',
        platformRefId: signal.id,
      }
    }

    const { data: ext } = await db
      .from('external_signals')
      .select('id, title, summary, url, published_at, geography, entity_tags')
      .eq('id', input.articleId)
      .single()

    if (ext) {
      return {
        title: ext.title,
        summary: ext.summary,
        keywords: extractKeywords(ext.title, ext.summary),
        entities: ext.entity_tags ?? [],
        date: ext.published_at?.slice(0, 10),
        url: ext.url,
        platformRefType: 'external_signal',
        platformRefId: ext.id,
      }
    }
  }

  const query = input.query ?? ''
  return resolveKeywordToEvent(query)
}

interface EventResolution {
  eventTitle: string
  eventSummary: string
  approximateDate: string
  entities: string[]
  keywords: string[]
}

async function resolveKeywordToEvent(query: string): Promise<AnchorContext> {
  const prompt = [
    `Given the keyword or topic: "${query}"`,
    ``,
    `Identify the MAIN current event or situation this keyword is most likely about.`,
    `Do NOT just repeat the keyword. Identify the actual geopolitical, economic, or strategic EVENT.`,
    ``,
    `Examples:`,
    `- "strait of Ormuz" → "US-Iran military confrontation and Strait of Hormuz blockade risk 2025-2026"`,
    `- "cocoa" → "West African cocoa supply crisis and record price surge 2024-2025"`,
    `- "Niger" → "Niger military junta standoff with ECOWAS and French withdrawal"`,
    `- "crypto" → "Global cryptocurrency market volatility and regulatory developments 2025"`,
    ``,
    `Return ONLY valid JSON:`,
    `{`,
    `  "eventTitle": "Short, specific title of the central event (max 15 words)",`,
    `  "eventSummary": "2-3 sentence summary of the current situation",`,
    `  "approximateDate": "YYYY-MM-DD approximate date of the most recent developments",`,
    `  "entities": ["key actor 1", "key actor 2", "key actor 3"],`,
    `  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]`,
    `}`,
  ].join('\n')

  try {
    const { text } = await callGemini(prompt, { maxOutputTokens: 1000, temperature: 0.3 })
    const parsed = parseGeminiJson<EventResolution>(text)

    if (parsed?.eventTitle) {
      console.log(`[resolveKeywordToEvent] "${query}" → "${parsed.eventTitle}"`)

      const db = createAdminClient()
      const { data: matchingEvent } = await db
        .from('forecast_events')
        .select('id, title, description')
        .ilike('title', `%${query}%`)
        .limit(1)
        .maybeSingle()

      return {
        title: parsed.eventTitle,
        summary: parsed.eventSummary,
        keywords: parsed.keywords?.length > 0
          ? parsed.keywords
          : extractKeywords(parsed.eventTitle, parsed.eventSummary),
        entities: parsed.entities ?? [],
        date: parsed.approximateDate?.slice(0, 10),
        platformRefType: matchingEvent ? 'forecast_event' : undefined,
        platformRefId: matchingEvent?.id,
      }
    }
  } catch (err) {
    console.error('[resolveKeywordToEvent] Gemini call failed, falling back to raw keyword:', err)
  }

  return {
    title: query,
    summary: undefined,
    keywords: extractKeywords(query, ''),
  }
}

function extractKeywords(title: string, summary?: string | null): string[] {
  const text = `${title} ${summary ?? ''}`.toLowerCase()
  const stopwords = new Set([
    'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'et', 'en', 'au', 'aux',
    'a', 'ce', 'se', 'ne', 'pas', 'par', 'pour', 'sur', 'avec', 'dans', 'qui', 'que',
    'est', 'son', 'sa', 'ses', 'ou', 'the', 'of', 'in', 'and', 'to', 'on', 'at',
    'by', 'an', 'is', 'it', 'as', 'or', 'be', 'from', 'with', 'for', 'this', 'that',
  ])
  return text
    .split(/[\s\-_/,.;:!?'"()]+/)
    .filter(t => t.length > 2 && !stopwords.has(t))
    .slice(0, 15)
}

export interface StorylineBuilderStream {
  onEvent: (event: StorylineSSEEvent) => void
}

// ═══════════════════════════════════════════════════════════════════════════
// V3 Pipeline: Relation-graph-based storyline building
// ═══════════════════════════════════════════════════════════════════════════

export async function buildStoryline(
  anchor: AnchorContext,
  stream: StorylineBuilderStream,
): Promise<StorylineResult> {
  try {
    // ── Phase 2: Hybrid Retrieval (parallel) ────────────────────────────
    const [internalCandidates, externalCandidates] = await Promise.all([
      retrieveInternalCandidates(anchor),
      retrieveExternalCandidates(anchor, (windowLabel, windowCandidates) => {
        const preview = candidatesToPreviewCards(windowCandidates, windowLabel)
        if (preview.length > 0) {
          stream.onEvent({ phase: 'external', cards: preview })
        }
      }),
    ])

    const internalCards = candidatesToPreviewCards(internalCandidates, 'internal')
    stream.onEvent({ phase: 'internal', cards: internalCards })

    const allCandidates = [...internalCandidates, ...externalCandidates]

    // ── Phase 3: Candidate Ranking ──────────────────────────────────────
    const ranked = rankAndPruneCandidates(
      allCandidates,
      anchor.keywords,
      anchor.entities ?? [],
    )
    console.log(`[builder-v3] Phase 2-3: ${allCandidates.length} candidates → ${ranked.length} after ranking`)

    // ── Phase 4: Event Extraction (batch LLM) ───────────────────────────
    const extractedEvents = await extractEventsFromCandidates(ranked, 30, anchor.title)
    console.log(`[builder-v3] Phase 4: ${extractedEvents.length} events extracted`)

    // ── Phase 5: Event Clustering ───────────────────────────────────────
    let clusters = await clusterEvents(extractedEvents)
    console.log(`[builder-v3] Phase 5: ${clusters.length} clusters`)

    // ── Phase 6: Historical Expansion ───────────────────────────────────
    const biasResult = detectRecencyBias(clusters)
    if (biasResult.hasRecencyBias) {
      console.log(`[builder-v3] Phase 6: Recency bias detected — ${biasResult.reason}`)
      const historicalCandidates = await searchHistoricalContext(
        anchor.keywords,
        anchor.entities ?? [],
        clusters,
      )

      if (historicalCandidates.length > 0) {
        const historicalExtracted = await extractEventsFromCandidates(historicalCandidates, 15, anchor.title)
        const historicalClusters = await clusterEvents(historicalExtracted)
        clusters = await reclusterMerged(clusters, historicalClusters)
        console.log(`[builder-v3] Phase 6: ${clusters.length} clusters after historical merge`)
      }
    } else {
      console.log(`[builder-v3] Phase 6: No recency bias, skipping historical expansion`)
    }

    // ── Phase 7: Relation Graph Building ────────────────────────────────
    const temporalRelations = buildTemporalRelations(clusters, anchor)

    const [causalRelations, corollaryRelations] = await Promise.all([
      detectCausalRelations(clusters, temporalRelations, anchor),
      detectCorollaryRelations(clusters, temporalRelations, [], anchor),
    ])

    let allRelations = [...temporalRelations, ...causalRelations, ...corollaryRelations]
    console.log(`[builder-v3] Phase 7: ${temporalRelations.length} temporal, ${causalRelations.length} causal, ${corollaryRelations.length} corollary`)

    // ── Phase 8: Counterfactual Causal Scoring ──────────────────────────
    allRelations = applyCounterfactualChecks(allRelations, clusters, anchor)

    stream.onEvent({ phase: 'analysis', narrative: '' })

    // ── Phase 9: Mandatory Outcome Generation ───────────────────────────
    const outcomes = await generateOutcomes({
      anchor,
      clusters,
      relations: allRelations,
    })

    const outcomePreviewCards: StorylineCard[] = outcomes.map((o, i) => ({
      id: `preview-outcome-${i}`,
      cardType: 'outcome' as const,
      temporalPosition: 'future' as const,
      title: o.title,
      summary: o.reasoning,
      probability: o.probability,
      probabilitySource: o.probabilitySource,
      entities: [],
      regionTags: [],
      sectorTags: [],
      sourceUrls: [],
      importance: 7,
      sortOrder: i,
    }))
    stream.onEvent({ phase: 'outcomes', cards: outcomePreviewCards })
    console.log(`[builder-v3] Phase 9: ${outcomes.length} outcomes generated`)

    // ── Phase 10: Storyline Assembly (graph, not chain) ─────────────────
    const storyline = assembleStorylineGraph(anchor, clusters, allRelations, outcomes)

    // ── Phase 11: Narrative Generation ──────────────────────────────────
    const narrativeText = await generateNarrative(anchor, clusters, allRelations, outcomes)
    storyline.narrative = narrativeText
    console.log(`[builder-v3] Phase 11: Narrative generated (${narrativeText.length} chars)`)

    // ── Phase 12: SSE Complete ──────────────────────────────────────────
    stream.onEvent({ phase: 'complete', storyline })
    return storyline
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[builder-v3] Fatal error:', message)
    stream.onEvent({ phase: 'error', error: message })
    throw err
  }
}

function candidatesToPreviewCards(
  candidates: CandidateItem[],
  sourceLabel: string,
): StorylineCard[] {
  return candidates.slice(0, 15).map((c, i) => ({
    id: `preview-${sourceLabel}-${i}`,
    cardType: (c.platformRefType === 'forecast_event' || c.platformRefType === 'intel_event' ? 'event' : 'article') as StorylineCard['cardType'],
    temporalPosition: 'concurrent' as const,
    title: c.title,
    summary: c.summary,
    date: c.date,
    entities: c.entities ?? [],
    regionTags: c.regionTags ?? [],
    sectorTags: c.sectorTags ?? [],
    sourceUrls: c.url ? [c.url] : [],
    platformRefType: c.platformRefType,
    platformRefId: c.platformRefId,
    importance: 5,
    sortOrder: i,
  }))
}
