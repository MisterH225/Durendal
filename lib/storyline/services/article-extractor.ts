import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import type { CandidateItem } from '@/lib/graph/types'
import type { ExtractedEvent } from '../types/event-extraction'

const BATCH_SIZE = 10

interface BatchExtractionResult {
  events: Array<{
    articleIndex: number
    eventDate: string | null
    eventDateConfidence: 'high' | 'medium' | 'low'
    canonicalEventTitle: string
    eventSummary: string
    entities: string[]
    geography: string[]
    isRelevantToQuery: boolean
  }>
}

function buildBatchPrompt(candidates: CandidateItem[], anchorTitle: string): string {
  const articleList = candidates.map((c, i) => {
    return [
      `[${i}] Title: "${c.title}"`,
      c.date ? `    Date: ${c.date}` : '',
      c.summary ? `    Excerpt: ${c.summary.slice(0, 300)}` : '',
      (c.entities?.length ?? 0) > 0 ? `    Entities: ${c.entities!.join(', ')}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  return [
    `You are analyzing ${candidates.length} news articles/signals related to: "${anchorTitle}"`,
    ``,
    `For EACH article, extract the CORE EVENT it describes.`,
    ``,
    `Articles:`,
    articleList,
    ``,
    `For EACH article, extract:`,
    `1. articleIndex: the [N] index of the article`,
    `2. eventDate: actual date the EVENT occurred (YYYY-MM-DD). NOT the publication date. null if unknown.`,
    `3. eventDateConfidence: "high" if explicit date, "medium" if inferred, "low" if guessed`,
    `4. canonicalEventTitle: normalized generic French title (max 80 chars). Multiple articles about the same event should produce the SAME title.`,
    `5. eventSummary: 2-3 sentences about WHAT HAPPENED`,
    `6. entities: key actors (max 5)`,
    `7. geography: countries/regions (max 3)`,
    `8. isRelevantToQuery: true if this article is genuinely related to "${anchorTitle}", false if it's off-topic`,
    ``,
    `IMPORTANT: Set isRelevantToQuery=false for articles that are NOT about the main topic.`,
    `Example: if the query is about "Iran war", an article about "China tariffs" is NOT relevant.`,
    ``,
    `Return ONLY valid JSON:`,
    `{"events": [{"articleIndex": 0, "eventDate": "2026-01-15", "eventDateConfidence": "high", "canonicalEventTitle": "...", "eventSummary": "...", "entities": ["..."], "geography": ["..."], "isRelevantToQuery": true}]}`,
  ].join('\n')
}

function candidateToExtractedEvent(
  candidate: CandidateItem,
  extraction: BatchExtractionResult['events'][number],
): ExtractedEvent {
  return {
    articleId: candidate.platformRefId,
    articleUrl: candidate.url,
    articleTitle: candidate.title,
    articleSource: candidate.sourceType,
    eventDate: extraction.eventDate?.slice(0, 10) ?? null,
    eventDateConfidence: extraction.eventDateConfidence ?? 'low',
    canonicalEventTitle: extraction.canonicalEventTitle.slice(0, 120),
    eventSummary: extraction.eventSummary ?? candidate.summary?.slice(0, 300) ?? '',
    entities: (extraction.entities ?? []).slice(0, 8),
    geography: (extraction.geography ?? []).slice(0, 5),
    extractedAt: new Date().toISOString(),
    rawSnippet: candidate.summary?.slice(0, 400) ?? '',
    sourceType: candidate.sourceType,
    platformRefType: candidate.platformRefType,
    platformRefId: candidate.platformRefId,
    regionTags: candidate.regionTags,
    sectorTags: candidate.sectorTags,
    relevanceScore: candidate.relevanceScore,
  }
}

async function extractBatch(
  candidates: CandidateItem[],
  anchorTitle: string,
): Promise<ExtractedEvent[]> {
  if (candidates.length === 0) return []

  try {
    const prompt = buildBatchPrompt(candidates, anchorTitle)
    const { text } = await callGemini(prompt, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 4000,
      temperature: 0.1,
    })

    const parsed = parseGeminiJson<BatchExtractionResult>(text)
    if (!parsed?.events || !Array.isArray(parsed.events)) {
      console.warn(`[article-extractor] Batch parse failed, ${candidates.length} candidates lost`)
      return []
    }

    const results: ExtractedEvent[] = []
    for (const extraction of parsed.events) {
      const idx = extraction.articleIndex
      if (idx < 0 || idx >= candidates.length) continue
      if (!extraction.canonicalEventTitle) continue
      if (extraction.isRelevantToQuery === false) {
        console.log(`[article-extractor] Filtered off-topic: "${candidates[idx].title.slice(0, 50)}"`)
        continue
      }

      results.push(candidateToExtractedEvent(candidates[idx], extraction))
    }

    return results
  } catch (err) {
    console.error(`[article-extractor] Batch extraction failed:`, err)
    return []
  }
}

/**
 * Extract events from candidates using LLM batch processing.
 * Processes BATCH_SIZE articles per Gemini call (3-4 calls instead of 30).
 */
export async function extractEventsFromCandidates(
  candidates: CandidateItem[],
  maxItems = 30,
  anchorTitle = '',
): Promise<ExtractedEvent[]> {
  const toProcess = candidates.slice(0, maxItems)
  const results: ExtractedEvent[] = []

  // Process in batches of BATCH_SIZE, run 2 batches in parallel
  const batches: CandidateItem[][] = []
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    batches.push(toProcess.slice(i, i + BATCH_SIZE))
  }

  const PARALLEL_BATCHES = 2
  for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
    const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES)
    const batchResults = await Promise.allSettled(
      parallelBatches.map(batch => extractBatch(batch, anchorTitle)),
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(...result.value)
      }
    }
  }

  console.log(`[article-extractor] Extracted ${results.length} relevant events from ${toProcess.length} candidates (${batches.length} batches)`)
  return results
}
