import type { StorylineSSEEvent, StorylineCard, StorylineResult, CandidateItem } from '@/lib/graph/types'
import { retrieveInternalCandidates, retrieveExternalCandidates } from './services/hybrid-retrieval'
import type { AnchorContext } from './services/hybrid-retrieval'
import { rankAndPruneCandidates } from './services/candidate-ranking'
import { analyzeStoryline } from './services/storyline-analysis'
import { assembleStoryline } from './services/storyline-assembler'
import { generateOutcomes } from './services/outcome-generator'
import { createAdminClient } from '@/lib/supabase/admin'

export type { AnchorContext }

const MIN_OUTCOMES = 2

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

export async function buildStoryline(
  anchor: AnchorContext,
  stream: StorylineBuilderStream,
): Promise<StorylineResult> {
  try {
    const internalCandidates = await retrieveInternalCandidates(anchor)
    const internalCards = candidatesToPreviewCards(internalCandidates, 'internal')
    stream.onEvent({ phase: 'internal', cards: internalCards })

    let allCandidates = [...internalCandidates]
    const externalCandidates = await retrieveExternalCandidates(anchor, (windowLabel, windowCandidates) => {
      const preview = candidatesToPreviewCards(windowCandidates, windowLabel)
      if (preview.length > 0) {
        stream.onEvent({ phase: 'external', cards: preview })
      }
    })
    allCandidates = allCandidates.concat(externalCandidates)

    const ranked = rankAndPruneCandidates(
      allCandidates,
      anchor.keywords,
      anchor.entities ?? [],
    )

    const analysis = await analyzeStoryline(anchor, ranked)

    if (analysis.timeline.length > 0) {
      stream.onEvent({
        phase: 'analysis',
        narrative: analysis.narrative,
      })
    }

    let storyline = assembleStoryline(anchor, ranked, analysis)

    const outcomeCards = storyline.cards.filter(c => c.cardType === 'outcome')
    if (outcomeCards.length < MIN_OUTCOMES) {
      console.log(`[storyline-builder] Only ${outcomeCards.length} outcomes, triggering dedicated outcome generation`)

      const causalDrivers = storyline.cards.filter(c =>
        storyline.edges.some(e =>
          e.relationCategory === 'causal' &&
          (e.sourceCardId === c.id || e.targetCardId === c.id),
        ),
      )
      const corollaryEvents = storyline.cards.filter(c =>
        storyline.edges.some(e =>
          e.relationCategory === 'corollary' &&
          (e.sourceCardId === c.id || e.targetCardId === c.id),
        ),
      )
      const recentSignals = storyline.cards
        .filter(c => c.temporalPosition === 'recent' || c.temporalPosition === 'concurrent')
        .slice(0, 5)

      const generatedOutcomes = await generateOutcomes({
        anchor,
        causalDrivers,
        corollaryEvents,
        recentSignals,
        narrative: storyline.narrative ?? '',
      })

      const anchorCardId = storyline.cards.find(c => c.temporalPosition === 'anchor')?.id
      if (anchorCardId && generatedOutcomes.length > 0) {
        analysis.outcomes = generatedOutcomes
        storyline = assembleStoryline(anchor, ranked, analysis)
      }
    }

    const finalOutcomes = storyline.cards.filter(c => c.cardType === 'outcome')
    if (finalOutcomes.length > 0) {
      stream.onEvent({
        phase: 'outcomes',
        cards: finalOutcomes,
      })
    }

    stream.onEvent({
      phase: 'complete',
      storyline,
    })

    return storyline
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[storyline-builder] Fatal error:', message)
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
