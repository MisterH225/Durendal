import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import type { SourceArticle } from '@/lib/graph/types'
import type { ExtractedEvent } from '../types/event-extraction'
import type { EventCluster } from '../types/event-cluster'

function nextClusterId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `cluster-${Date.now().toString(36)}-${rand}`
}

function normalizeForComparison(t: string): string {
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''""«»]/g, '')
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const stopwords = new Set([
    'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'et', 'en', 'au', 'aux',
    'a', 'ce', 'se', 'ne', 'pas', 'par', 'pour', 'sur', 'avec', 'dans', 'qui', 'que',
    'est', 'the', 'of', 'in', 'and', 'to', 'on', 'at', 'by', 'an', 'is', 'or', 'as',
  ])
  const tokA = normalizeForComparison(a).split(/\s+/).filter(t => t.length > 2 && !stopwords.has(t))
  const tokB = normalizeForComparison(b).split(/\s+/).filter(t => t.length > 2 && !stopwords.has(t))
  if (tokA.length === 0 || tokB.length === 0) return 0

  let overlap = 0
  for (const t of tokA) {
    if (tokB.some(tb => tb.includes(t) || t.includes(tb))) overlap++
  }
  return overlap / Math.max(tokA.length, tokB.length)
}

/**
 * Fast pre-pass: check if two events are OBVIOUSLY about the same thing
 * using title similarity. Threshold is high to avoid false merges.
 */
function isFastMatch(eventA: ExtractedEvent, eventB: ExtractedEvent): boolean {
  const canonA = normalizeForComparison(eventA.canonicalEventTitle)
  const canonB = normalizeForComparison(eventB.canonicalEventTitle)
  if (canonA === canonB) return true
  if (canonA.includes(canonB) || canonB.includes(canonA)) return true
  return tokenOverlap(eventA.canonicalEventTitle, eventB.canonicalEventTitle) >= 0.65
}

interface ClusterMergeCheck {
  isSameEvent: boolean
  confidence: string
  mergedTitle?: string
}

/**
 * LLM-based check for borderline cases where fast matching isn't conclusive.
 */
async function llmCheckSameEvent(
  clusterTitle: string,
  clusterSummary: string,
  eventTitle: string,
  eventSummary: string,
): Promise<ClusterMergeCheck> {
  const prompt = [
    `You are clustering news events. Determine if these two items describe the SAME real-world event or DIFFERENT events.`,
    ``,
    `Cluster (existing group):`,
    `- Title: "${clusterTitle}"`,
    `- Summary: "${clusterSummary.slice(0, 200)}"`,
    ``,
    `New event:`,
    `- Title: "${eventTitle}"`,
    `- Summary: "${eventSummary.slice(0, 200)}"`,
    ``,
    `SAME = They describe the exact same occurrence (e.g., "Blocus US d'Ormuz" and "US imposes Hormuz blockade").`,
    `DIFFERENT = They describe distinct occurrences, even if related (e.g., "Blocus d'Ormuz" vs "Hausse du prix du pétrole").`,
    ``,
    `Return ONLY JSON:`,
    `{"isSameEvent": true|false, "confidence": "high"|"medium"|"low", "mergedTitle": "Best canonical title if same event"}`,
  ].join('\n')

  try {
    const { text } = await callGemini(prompt, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 200,
      temperature: 0.05,
    })
    const parsed = parseGeminiJson<ClusterMergeCheck>(text)
    return parsed ?? { isSameEvent: false, confidence: 'low' }
  } catch {
    return { isSameEvent: false, confidence: 'low' }
  }
}

/**
 * Choose the best date among extracted events in a cluster.
 * Prioritize: high > medium > low confidence. Break ties by most recent.
 */
function bestDate(events: ExtractedEvent[]): { date: string | null; confidence: 'high' | 'medium' | 'low' } {
  const withDate = events.filter(e => e.eventDate)
  if (withDate.length === 0) return { date: null, confidence: 'low' }

  const ranked = [...withDate].sort((a, b) => {
    const confOrder = { high: 3, medium: 2, low: 1 }
    const diff = (confOrder[b.eventDateConfidence] ?? 0) - (confOrder[a.eventDateConfidence] ?? 0)
    if (diff !== 0) return diff
    return (b.eventDate ?? '').localeCompare(a.eventDate ?? '')
  })

  return { date: ranked[0].eventDate, confidence: ranked[0].eventDateConfidence }
}

function mergeEntities(events: ExtractedEvent[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const e of events) {
    for (const ent of e.entities) {
      const key = ent.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push(ent)
      }
    }
  }
  return result.slice(0, 8)
}

function mergeGeography(events: ExtractedEvent[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const e of events) {
    for (const geo of e.geography) {
      const key = geo.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push(geo)
      }
    }
  }
  return result.slice(0, 5)
}

function bestSummary(events: ExtractedEvent[]): string {
  const sorted = [...events].sort((a, b) => b.eventSummary.length - a.eventSummary.length)
  return sorted[0]?.eventSummary ?? ''
}

function buildSourceArticles(events: ExtractedEvent[]): SourceArticle[] {
  const seen = new Set<string>()
  const articles: SourceArticle[] = []
  for (const e of events) {
    if (e.articleUrl && !seen.has(e.articleUrl)) {
      seen.add(e.articleUrl)
      articles.push({ title: e.articleTitle.slice(0, 100), url: e.articleUrl })
    }
  }
  return articles.slice(0, 5)
}

function bestPlatformRef(events: ExtractedEvent[]): { type?: string; id?: string } {
  const internal = events.find(e => e.sourceType === 'internal' && e.platformRefType)
  if (internal) return { type: internal.platformRefType, id: internal.platformRefId }
  const withRef = events.find(e => e.platformRefType)
  return { type: withRef?.platformRefType, id: withRef?.platformRefId }
}

function mergeRegionTags(events: ExtractedEvent[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const e of events) {
    for (const r of e.regionTags ?? []) {
      if (!seen.has(r)) { seen.add(r); result.push(r) }
    }
  }
  return result
}

function mergeSectorTags(events: ExtractedEvent[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const e of events) {
    for (const s of e.sectorTags ?? []) {
      if (!seen.has(s)) { seen.add(s); result.push(s) }
    }
  }
  return result
}

interface InternalCluster {
  events: ExtractedEvent[]
  canonicalTitle: string
  summary: string
}

/**
 * Cluster extracted events into EventClusters.
 * Two-pass approach:
 *   1. Fast token-overlap matching (no LLM cost)
 *   2. LLM verification for borderline matches
 */
export async function clusterEvents(
  extractedEvents: ExtractedEvent[],
): Promise<EventCluster[]> {
  if (extractedEvents.length === 0) return []

  const clusters: InternalCluster[] = []
  const llmChecksNeeded: Array<{ clusterIdx: number; event: ExtractedEvent }> = []

  // Pass 1: Fast matching
  for (const event of extractedEvents) {
    let matched = false

    for (const cluster of clusters) {
      if (cluster.events.some(e => isFastMatch(e, event))) {
        cluster.events.push(event)
        matched = true
        break
      }
    }

    if (!matched) {
      // Check token overlap for borderline matches
      let borderlineClusterIdx = -1
      let bestOverlap = 0

      for (let i = 0; i < clusters.length; i++) {
        const overlap = tokenOverlap(
          clusters[i].canonicalTitle,
          event.canonicalEventTitle,
        )
        if (overlap > bestOverlap) {
          bestOverlap = overlap
          borderlineClusterIdx = i
        }
      }

      // Borderline zone: 0.40 - 0.65 → needs LLM check
      if (bestOverlap >= 0.40 && bestOverlap < 0.65 && borderlineClusterIdx >= 0) {
        llmChecksNeeded.push({ clusterIdx: borderlineClusterIdx, event })
      } else {
        clusters.push({
          events: [event],
          canonicalTitle: event.canonicalEventTitle,
          summary: event.eventSummary,
        })
      }
    }
  }

  // Pass 2: LLM checks for borderline cases (batch)
  if (llmChecksNeeded.length > 0) {
    console.log(`[event-clusterer] ${llmChecksNeeded.length} borderline cases need LLM check`)
    const checkResults = await Promise.allSettled(
      llmChecksNeeded.map(({ clusterIdx, event }) =>
        llmCheckSameEvent(
          clusters[clusterIdx].canonicalTitle,
          clusters[clusterIdx].summary,
          event.canonicalEventTitle,
          event.eventSummary,
        ).then(result => ({ clusterIdx, event, result })),
      ),
    )

    for (const settled of checkResults) {
      if (settled.status !== 'fulfilled') continue
      const { clusterIdx, event, result } = settled.value

      if (result.isSameEvent && result.confidence !== 'low') {
        clusters[clusterIdx].events.push(event)
        if (result.mergedTitle) {
          clusters[clusterIdx].canonicalTitle = result.mergedTitle
        }
      } else {
        clusters.push({
          events: [event],
          canonicalTitle: event.canonicalEventTitle,
          summary: event.eventSummary,
        })
      }
    }
  }

  // Build final EventCluster objects
  const result: EventCluster[] = clusters.map(cluster => {
    const dateInfo = bestDate(cluster.events)
    const ref = bestPlatformRef(cluster.events)
    const representativeIdx = cluster.events.reduce((best, e, i) =>
      e.eventSummary.length > cluster.events[best].eventSummary.length ? i : best,
      0,
    )

    return {
      clusterId: nextClusterId(),
      canonicalTitle: cluster.canonicalTitle,
      eventDate: dateInfo.date,
      eventDateConfidence: dateInfo.confidence,
      summary: bestSummary(cluster.events),
      entities: mergeEntities(cluster.events),
      geography: mergeGeography(cluster.events),
      sourceArticles: buildSourceArticles(cluster.events),
      clusterSize: cluster.events.length,
      representativeEventIdx: representativeIdx,
      platformRefType: ref.type,
      platformRefId: ref.id,
      regionTags: mergeRegionTags(cluster.events),
      sectorTags: mergeSectorTags(cluster.events),
      sourceType: cluster.events[0].sourceType,
    }
  })

  console.log(`[event-clusterer] ${extractedEvents.length} events → ${result.length} clusters`)
  return result
}

/**
 * Merge incoming clusters into an existing set, cross-checking for duplicates.
 * Used after historical expansion to avoid having the same event in both sets.
 */
export async function reclusterMerged(
  existing: EventCluster[],
  incoming: EventCluster[],
): Promise<EventCluster[]> {
  const merged = [...existing]
  const llmChecksNeeded: Array<{ existingIdx: number; incoming: EventCluster }> = []

  for (const inc of incoming) {
    let matched = false

    for (let i = 0; i < merged.length; i++) {
      const overlap = tokenOverlap(merged[i].canonicalTitle, inc.canonicalTitle)
      if (overlap >= 0.65 || normalizeForComparison(merged[i].canonicalTitle) === normalizeForComparison(inc.canonicalTitle)) {
        mergeClusterInto(merged[i], inc)
        matched = true
        break
      }
      if (overlap >= 0.40 && overlap < 0.65) {
        llmChecksNeeded.push({ existingIdx: i, incoming: inc })
        matched = true
        break
      }
    }

    if (!matched) {
      merged.push(inc)
    }
  }

  if (llmChecksNeeded.length > 0) {
    const checkResults = await Promise.allSettled(
      llmChecksNeeded.map(({ existingIdx, incoming: inc }) =>
        llmCheckSameEvent(
          merged[existingIdx].canonicalTitle,
          merged[existingIdx].summary,
          inc.canonicalTitle,
          inc.summary,
        ).then(result => ({ existingIdx, incoming: inc, result })),
      ),
    )

    for (const settled of checkResults) {
      if (settled.status !== 'fulfilled') continue
      const { existingIdx, incoming: inc, result } = settled.value

      if (result.isSameEvent && result.confidence !== 'low') {
        mergeClusterInto(merged[existingIdx], inc)
        if (result.mergedTitle) {
          merged[existingIdx].canonicalTitle = result.mergedTitle
        }
      } else {
        merged.push(inc)
      }
    }
  }

  console.log(`[event-clusterer] recluster: ${existing.length} + ${incoming.length} → ${merged.length} clusters`)
  return merged
}

function mergeClusterInto(target: EventCluster, source: EventCluster): void {
  target.clusterSize += source.clusterSize

  const existingUrls = new Set(target.sourceArticles.map(a => a.url))
  for (const article of source.sourceArticles) {
    if (!existingUrls.has(article.url)) {
      target.sourceArticles.push(article)
    }
  }
  target.sourceArticles = target.sourceArticles.slice(0, 6)

  const existingEntities = new Set(target.entities.map(e => e.toLowerCase()))
  for (const ent of source.entities) {
    if (!existingEntities.has(ent.toLowerCase())) {
      target.entities.push(ent)
      existingEntities.add(ent.toLowerCase())
    }
  }
  target.entities = target.entities.slice(0, 10)

  if (source.summary.length > target.summary.length) {
    target.summary = source.summary
  }

  const confRank = { high: 3, medium: 2, low: 1 }
  if ((confRank[source.eventDateConfidence] ?? 0) > (confRank[target.eventDateConfidence] ?? 0)) {
    target.eventDate = source.eventDate
    target.eventDateConfidence = source.eventDateConfidence
  }
}
