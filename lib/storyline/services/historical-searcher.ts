import { perplexityResponses, isPerplexityQuotaError } from '@/lib/ai/perplexity'
import type { SearchRecency } from '@/lib/ai/perplexity'
import type { CandidateItem } from '@/lib/graph/types'
import type { EventCluster } from '../types/event-cluster'

interface HistoricalQuery {
  prompt: string
  focus: string
  recency: SearchRecency
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

  const jsonFormat = `Return ONLY valid JSON: {"items": [{"title":"...","date":"...","summary":"...","entities":["..."],"regions":["..."]}]}`

  return [
    {
      focus: 'recent_context',
      recency: 'month',
      prompt: [
        `Find key developments from the past 1-6 MONTHS that directly led to: "${mainTopic}".`,
        mainEntities ? `Key actors: ${mainEntities}` : '',
        ``,
        `Current situation: ${clusterTitles}`,
        ``,
        `I need the INTERMEDIATE events — decisions, escalations, turning points — from the recent months.`,
        `For each: title (max 80 chars), date (YYYY-MM-DD), summary (2-3 sentences), entities, regions.`,
        ``,
        jsonFormat,
        `Return 3-5 items, chronologically ordered. DIFFERENT from: ${clusterTitles.slice(0, 200)}`,
      ].filter(Boolean).join('\n'),
    },
    {
      focus: 'structural_preconditions',
      recency: 'year',
      prompt: [
        `What are the STRUCTURAL FACTORS from 6 months to 2 years ago behind: "${mainTopic}"?`,
        mainEntities ? `Key actors: ${mainEntities}` : '',
        ``,
        `Think: policy decisions, treaties, elections, economic shifts, military buildups.`,
        `For each: title (max 80 chars), date (YYYY-MM-DD), summary (2-3 sentences), entities, regions.`,
        ``,
        jsonFormat,
        `Return 3-5 items, chronologically ordered.`,
      ].filter(Boolean).join('\n'),
    },
    {
      focus: 'deep_historical_roots',
      recency: 'year',
      prompt: [
        `I need a DEEP HISTORICAL TIMELINE (2-10 years ago) of the ROOT CAUSES behind: "${mainTopic}".`,
        ``,
        `Current situation: ${clusterTitles}`,
        ``,
        `Go DEEP into history. Find foundational events, treaties, conflicts, regime changes, structural shifts`,
        `that created the CONDITIONS for the current crisis to emerge.`,
        `For each: title (max 80 chars), date (YYYY-MM-DD), summary (2-3 sentences), entities, regions.`,
        ``,
        jsonFormat,
        `Return 4-6 items, chronologically ordered from oldest to most recent.`,
      ].join('\n'),
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
  if (process.env.DISABLE_PERPLEXITY === '1' || process.env.DISABLE_PERPLEXITY === 'true') {
    return []
  }

  const queries = buildHistoricalQueries(keywords, entities, currentClusters)

  const results = await Promise.allSettled(
    queries.map(async (query) => {
      const { text } = await perplexityResponses(query.prompt, {
        recency: query.recency,
        languages: ['fr', 'en'],
      })

      const candidates = parseHistoricalResponse(text, query.focus)
      console.log(`[historical-searcher] ${query.focus}: found ${candidates.length} historical events`)
      return candidates
    }),
  )

  const allCandidates: CandidateItem[] = []
  let quotaFailures = 0
  let otherFailures = 0

  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      allCandidates.push(...(results[i] as PromiseFulfilledResult<CandidateItem[]>).value)
    } else {
      const reason = (results[i] as PromiseRejectedResult).reason
      if (isPerplexityQuotaError(reason)) quotaFailures++
      else {
        otherFailures++
        console.error(`[historical-searcher] ${queries[i].focus} failed:`, reason)
      }
    }
  }

  if (quotaFailures === queries.length && queries.length > 0) {
    console.warn('[historical-searcher] Perplexity quota épuisée — expansion historique via Perplexity ignorée')
  }

  const deduped: CandidateItem[] = []
  for (const c of allCandidates) {
    const normTitle = c.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 60)
    const isDup = deduped.some(d => {
      const dNorm = d.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 60)
      return dNorm === normTitle || dNorm.includes(normTitle) || normTitle.includes(dNorm)
    })
    if (!isDup) deduped.push(c)
  }

  console.log(`[historical-searcher] Total: ${deduped.length} unique historical events from ${queries.length} parallel queries`)
  return deduped
}
