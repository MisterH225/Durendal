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
import { callGemini, callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import type { EventCluster } from './types/event-cluster'
import type { ExtractedEvent } from './types/event-extraction'

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
    // Run Perplexity in parallel with Gemini+Search fallback so we always have data
    const [retrievalResult, geminiDirect] = await Promise.all([
      safeRetrievalPipeline(anchor, stream),
      directGeminiSearchFallback(anchor),
    ])

    let clusters = retrievalResult.clusters
    console.log(`[builder-v3] Phase 2-5: normal pipeline → ${clusters.length} clusters, Gemini fallback → ${geminiDirect.length} clusters`)

    // Merge: prefer normal pipeline clusters, supplement with Gemini fallback
    if (clusters.length === 0 && geminiDirect.length > 0) {
      clusters = geminiDirect
      console.log(`[builder-v3] Using Gemini fallback as primary source (${clusters.length} clusters)`)
    } else if (clusters.length > 0 && geminiDirect.length > 0) {
      clusters = await reclusterMerged(clusters, geminiDirect)
      console.log(`[builder-v3] Merged normal + Gemini fallback → ${clusters.length} clusters`)
    }

    if (clusters.length === 0) {
      console.error(`[builder-v3] CRITICAL: 0 clusters from all sources. Anchor: "${anchor.title}"`)
    }

    // ── Phase 6: Historical Expansion ───────────────────────────────────
    const biasResult = detectRecencyBias(clusters)
    if (biasResult.hasRecencyBias && clusters.length > 0) {
      console.log(`[builder-v3] Phase 6: Recency bias detected — ${biasResult.reason}`)
      try {
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
      } catch (err) {
        console.error(`[builder-v3] Phase 6 failed (non-fatal):`, err)
      }
    } else {
      console.log(`[builder-v3] Phase 6: Skipping historical expansion (bias=${biasResult.hasRecencyBias}, clusters=${clusters.length})`)
    }

    // ── Phase 7: Relation Graph Building ────────────────────────────────
    const temporalRelations = buildTemporalRelations(clusters, anchor)

    const [causalRelations, corollaryRelations] = await Promise.all([
      detectCausalRelations(clusters, temporalRelations, anchor).catch(err => {
        console.error('[builder-v3] Causal detection failed (non-fatal):', err)
        return []
      }),
      detectCorollaryRelations(clusters, temporalRelations, [], anchor).catch(err => {
        console.error('[builder-v3] Corollary detection failed (non-fatal):', err)
        return []
      }),
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
    console.log(`[builder-v3] Phase 10: assembled ${storyline.cards.length} cards, ${storyline.edges.length} edges`)

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

async function safeRetrievalPipeline(
  anchor: AnchorContext,
  stream: StorylineBuilderStream,
): Promise<{ clusters: EventCluster[] }> {
  try {
    // Phase 2: Parallel retrieval
    const [internalCandidates, externalCandidates] = await Promise.allSettled([
      retrieveInternalCandidates(anchor),
      retrieveExternalCandidates(anchor, (windowLabel, windowCandidates) => {
        const preview = candidatesToPreviewCards(windowCandidates, windowLabel)
        if (preview.length > 0) {
          stream.onEvent({ phase: 'external', cards: preview })
        }
      }),
    ])

    const internal = internalCandidates.status === 'fulfilled' ? internalCandidates.value : []
    const external = externalCandidates.status === 'fulfilled' ? externalCandidates.value : []

    if (internalCandidates.status === 'rejected') {
      console.error('[builder-v3] Internal retrieval failed:', internalCandidates.reason)
    }
    if (externalCandidates.status === 'rejected') {
      console.error('[builder-v3] External retrieval failed:', externalCandidates.reason)
    }

    console.log(`[builder-v3] Phase 2: internal=${internal.length}, external=${external.length}`)

    const internalCards = candidatesToPreviewCards(internal, 'internal')
    stream.onEvent({ phase: 'internal', cards: internalCards })

    const allCandidates = [...internal, ...external]
    if (allCandidates.length === 0) {
      console.warn('[builder-v3] 0 candidates from all retrieval sources')
      return { clusters: [] }
    }

    // Phase 3: Ranking
    let ranked = rankAndPruneCandidates(allCandidates, anchor.keywords, anchor.entities ?? [])
    if (ranked.length === 0 && allCandidates.length > 0) {
      console.warn(`[builder-v3] Ranking pruned all ${allCandidates.length} candidates, bypassing`)
      ranked = allCandidates.slice(0, 25)
    }
    console.log(`[builder-v3] Phase 3: ${allCandidates.length} → ${ranked.length} after ranking`)

    // Phase 4: Extraction
    const extractedEvents = await extractEventsFromCandidates(ranked, 30, anchor.title)
    console.log(`[builder-v3] Phase 4: ${extractedEvents.length} events from ${ranked.length} candidates`)

    if (extractedEvents.length === 0) {
      return { clusters: [] }
    }

    // Phase 5: Clustering
    const clusters = await clusterEvents(extractedEvents)
    console.log(`[builder-v3] Phase 5: ${clusters.length} clusters`)

    return { clusters }
  } catch (err) {
    console.error('[builder-v3] Retrieval pipeline failed (non-fatal):', err)
    return { clusters: [] }
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

// ═══════════════════════════════════════════════════════════════════════════
// Fallback: Direct Gemini + Google Search grounding
// Used when Perplexity retrieval + extraction produces 0 clusters
// ═══════════════════════════════════════════════════════════════════════════

interface DirectSearchEvent {
  title: string
  date: string | null
  summary: string
  entities: string[]
  regions: string[]
  sourceUrls: string[]
  causalRole: 'root_cause' | 'escalation' | 'turning_point' | 'reaction' | 'context'
}

interface DirectSearchResult {
  events: DirectSearchEvent[]
}

async function directGeminiSearchFallback(
  anchor: AnchorContext,
): Promise<EventCluster[]> {
  const prompt = [
    `You are a senior intelligence analyst with access to the internet.`,
    `Research the following topic thoroughly and build a CHRONOLOGICAL TIMELINE of key events.`,
    ``,
    `Topic: "${anchor.title}"`,
    anchor.summary ? `Context: ${anchor.summary.slice(0, 400)}` : '',
    anchor.entities?.length ? `Key actors: ${anchor.entities.join(', ')}` : '',
    ``,
    `I need 8-12 events that form the CAUSAL CHAIN leading to the current situation.`,
    ``,
    `REQUIREMENTS:`,
    `1. Go DEEP in history — include root causes from years ago, not just recent news`,
    `2. Each event must have a precise date (YYYY-MM-DD)`,
    `3. Each event must explain HOW it connects to the next step in the chain`,
    `4. Include source URLs when available`,
    `5. Cover: root causes → escalations → turning points → current situation`,
    `6. Include at least 2-3 events from > 6 months ago`,
    `7. Include at least 1-2 events from > 1 year ago if the topic has deep roots`,
    ``,
    `For each event:`,
    `- title: concise descriptive title (French, max 80 chars)`,
    `- date: YYYY-MM-DD (as precise as possible)`,
    `- summary: 2-3 sentences explaining what happened and its impact`,
    `- entities: key actors (countries, organizations, people) - max 5`,
    `- regions: geographic areas - max 3`,
    `- sourceUrls: article URLs for reference (max 3)`,
    `- causalRole: "root_cause" | "escalation" | "turning_point" | "reaction" | "context"`,
    ``,
    `Return ONLY valid JSON, no markdown:`,
    `{"events": [{"title":"...","date":"2025-01-15","summary":"...","entities":["..."],"regions":["..."],"sourceUrls":["..."],"causalRole":"escalation"}]}`,
    ``,
    `Order events CHRONOLOGICALLY from oldest to most recent.`,
  ].filter(Boolean).join('\n')

  try {
    const { text, sources } = await callGeminiWithSearch(prompt, {
      maxOutputTokens: 8000,
    })

    const parsed = parseGeminiJson<DirectSearchResult>(text)
    if (!parsed?.events || parsed.events.length === 0) {
      console.warn('[directGeminiSearchFallback] No events parsed from Gemini response')
      return []
    }

    const sourceUrlMap = new Map(sources.map(s => [s.url, s.title]))

    const clusters: EventCluster[] = parsed.events
      .filter(e => e.title)
      .map((e, i) => {
        const rand = Math.random().toString(36).slice(2, 10)
        const urls = (e.sourceUrls ?? []).filter(u => u && u.startsWith('http')).slice(0, 3)

        return {
          clusterId: `fallback-${Date.now().toString(36)}-${rand}`,
          canonicalTitle: e.title.slice(0, 120),
          eventDate: e.date?.match(/^\d{4}-\d{2}-\d{2}/) ? e.date.slice(0, 10) : null,
          eventDateConfidence: (e.date ? 'medium' : 'low') as EventCluster['eventDateConfidence'],
          summary: e.summary ?? '',
          entities: (e.entities ?? []).slice(0, 5),
          geography: (e.regions ?? []).slice(0, 3),
          sourceArticles: urls.map(url => {
            let hostname = 'source'
            try { hostname = new URL(url).hostname.replace('www.', '') } catch { /* malformed URL */ }
            return {
              title: sourceUrlMap.get(url) ?? url.split('/').pop()?.replace(/-/g, ' ')?.slice(0, 80) ?? 'Source',
              url,
              source: hostname,
            }
          }),
          clusterSize: 1,
          representativeEventIdx: 0,
          regionTags: (e.regions ?? []).slice(0, 3),
          sectorTags: [],
          sourceType: 'gemini' as const,
        }
      })

    console.log(`[directGeminiSearchFallback] Produced ${clusters.length} clusters from Gemini+Search`)
    return clusters
  } catch (err) {
    console.error('[directGeminiSearchFallback] Failed:', err)
    return []
  }
}
