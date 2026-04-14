import { perplexityResponses } from '@/lib/ai/perplexity'
import type { CandidateItem } from '@/lib/graph/types'
import type { EventCluster } from '../types/event-cluster'

interface HistoricalQuery {
  prompt: string
  focus: string
}

function buildHistoricalQueries(
  keywords: string[],
  entities: string[],
  currentClusters: EventCluster[],
): HistoricalQuery[] {
  const mainTopic = keywords.slice(0, 3).join(' ')
  const mainEntities = entities.slice(0, 3).join(', ')

  const clusterTitles = currentClusters
    .slice(0, 5)
    .map(c => c.canonicalTitle)
    .join('; ')

  return [
    {
      focus: 'deep_historical_roots',
      prompt: [
        `I need a HISTORICAL TIMELINE of the events that led to the current situation regarding: "${mainTopic}".`,
        ``,
        `Current situation summary (recent events):`,
        clusterTitles,
        ``,
        `Go DEEP into history. I need events from the past 2-5 YEARS that created the conditions for the current crisis.`,
        `Focus on: root causes, initial triggers, key turning points, diplomatic milestones, military escalations.`,
        ``,
        `For each historical event, provide:`,
        `- title: concise descriptive title (max 80 chars)`,
        `- date: YYYY-MM-DD (as precise as possible)`,
        `- summary: 2-3 sentences explaining what happened and how it contributed to the current situation`,
        `- entities: key actors (countries, organizations, leaders)`,
        `- regions: geographic areas`,
        `- causal_link: how this event led to or contributed to the next development`,
        ``,
        `Return ONLY valid JSON: {"items": [{"title":"...","date":"...","summary":"...","entities":["..."],"regions":["..."],"causal_link":"..."}]}`,
        ``,
        `Return 5-8 items, chronologically ordered from oldest to most recent.`,
        `These should be DIFFERENT events from the recent ones listed above.`,
      ].join('\n'),
    },
    {
      focus: 'structural_preconditions',
      prompt: [
        `What are the long-term STRUCTURAL FACTORS behind the current situation: "${mainTopic}"?`,
        mainEntities ? `Key actors involved: ${mainEntities}` : '',
        ``,
        `I need events/developments from 1-3 years ago that set the stage.`,
        `Think: policy decisions, treaties, elections, economic shifts, military buildups.`,
        ``,
        `For each event, provide:`,
        `- title: concise (max 80 chars)`,
        `- date: YYYY-MM-DD`,
        `- summary: 2-3 sentences`,
        `- entities: key actors`,
        `- regions: geographic areas`,
        ``,
        `Return ONLY valid JSON: {"items": [{"title":"...","date":"...","summary":"...","entities":["..."],"regions":["..."]}]}`,
        ``,
        `Return 3-5 items, chronologically ordered.`,
      ].filter(Boolean).join('\n'),
    },
  ]
}

function parseHistoricalResponse(text: string, focus: string): CandidateItem[] {
  const candidates: CandidateItem[] = []

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return candidates

    const parsed = JSON.parse(jsonMatch[0])
    const items = parsed.items ?? parsed.results ?? parsed.events ?? []

    for (const item of items) {
      if (!item.title) continue
      candidates.push({
        title: item.title,
        summary: item.summary ?? item.description ?? '',
        date: item.date ?? undefined,
        sourceType: 'perplexity',
        temporalWindow: focus,
        entities: item.entities ?? [],
        regionTags: item.regions ?? item.geography ?? [],
      })
    }
  } catch {
    if (text.length > 80) {
      candidates.push({
        title: `Contexte historique — ${focus}`,
        summary: text.slice(0, 500),
        sourceType: 'perplexity',
        temporalWindow: focus,
      })
    }
  }

  return candidates
}

/**
 * Search for historical context using Perplexity when recency bias is detected.
 * Returns CandidateItems that can then be processed through the extraction + clustering pipeline.
 */
export async function searchHistoricalContext(
  keywords: string[],
  entities: string[],
  currentClusters: EventCluster[],
): Promise<CandidateItem[]> {
  const queries = buildHistoricalQueries(keywords, entities, currentClusters)
  const allCandidates: CandidateItem[] = []

  for (const query of queries) {
    try {
      const { text } = await perplexityResponses(query.prompt, {
        recency: 'year',
        languages: ['fr', 'en'],
      })

      const candidates = parseHistoricalResponse(text, query.focus)
      allCandidates.push(...candidates)
      console.log(`[historical-searcher] ${query.focus}: found ${candidates.length} historical events`)
    } catch (err) {
      console.error(`[historical-searcher] ${query.focus} failed:`, err)
    }
  }

  // Deduplicate by title similarity
  const deduped: CandidateItem[] = []
  for (const c of allCandidates) {
    const normTitle = c.title.toLowerCase().slice(0, 50)
    const isDup = deduped.some(d =>
      d.title.toLowerCase().slice(0, 50) === normTitle ||
      d.title.toLowerCase().includes(normTitle) ||
      normTitle.includes(d.title.toLowerCase().slice(0, 50)),
    )
    if (!isDup) deduped.push(c)
  }

  console.log(`[historical-searcher] Total: ${deduped.length} unique historical events`)
  return deduped
}
