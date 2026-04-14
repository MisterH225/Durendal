import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import type { CandidateItem } from '@/lib/graph/types'
import type { ExtractedEvent } from '../types/event-extraction'

const BATCH_CONCURRENCY = 8

interface LLMExtractionResult {
  eventDate: string | null
  eventDateConfidence: 'high' | 'medium' | 'low'
  canonicalEventTitle: string
  eventSummary: string
  entities: string[]
  geography: string[]
}

function buildExtractionPrompt(candidate: CandidateItem): string {
  const contentParts = [
    `Title: ${candidate.title}`,
    candidate.url ? `URL: ${candidate.url}` : '',
    candidate.date ? `Collection/publication date: ${candidate.date}` : '',
    candidate.summary ? `Content excerpt: ${candidate.summary.slice(0, 600)}` : '',
    (candidate.entities?.length ?? 0) > 0 ? `Known entities: ${candidate.entities!.join(', ')}` : '',
    (candidate.regionTags?.length ?? 0) > 0 ? `Regions: ${candidate.regionTags!.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  return [
    `You are analyzing a news article/signal to extract the CORE EVENT it describes.`,
    `Your goal: identify the single real-world event this article is reporting on.`,
    ``,
    `Article/Signal:`,
    contentParts,
    ``,
    `Instructions:`,
    `1. eventDate: The actual date when the EVENT occurred (YYYY-MM-DD).`,
    `   - This is NOT the article publication date or collection date.`,
    `   - Look for explicit date mentions in the title/content ("on April 12", "le 13 avril").`,
    `   - If the article reports on an ongoing situation, use the most recent significant development date.`,
    `   - If no date can be determined, return null.`,
    `2. eventDateConfidence: "high" if explicit date in text, "medium" if inferred from recency context, "low" if guessed.`,
    `3. canonicalEventTitle: A normalized, GENERIC title for this event.`,
    `   - MERGE perspective: multiple articles about the same event should produce the SAME canonical title.`,
    `   - Example: "Trump orders Hormuz blockade" and "US imposes naval blockade on Strait of Hormuz" → "Blocus naval américain du détroit d'Ormuz"`,
    `   - Use French. Max 80 characters.`,
    `4. eventSummary: 2-3 sentences summarizing WHAT HAPPENED (not the article itself).`,
    `5. entities: Key actors (countries, organizations, people). Max 5.`,
    `6. geography: Countries/regions involved. Max 3.`,
    ``,
    `Return ONLY valid JSON, no markdown:`,
    `{`,
    `  "eventDate": "2026-04-12" or null,`,
    `  "eventDateConfidence": "high" | "medium" | "low",`,
    `  "canonicalEventTitle": "...",`,
    `  "eventSummary": "...",`,
    `  "entities": ["...", "..."],`,
    `  "geography": ["...", "..."]`,
    `}`,
  ].join('\n')
}

async function extractSingle(candidate: CandidateItem): Promise<ExtractedEvent | null> {
  if (!candidate.title || candidate.title.length < 5) return null

  try {
    const prompt = buildExtractionPrompt(candidate)
    const { text } = await callGemini(prompt, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 600,
      temperature: 0.1,
    })

    const parsed = parseGeminiJson<LLMExtractionResult>(text)
    if (!parsed?.canonicalEventTitle) return null

    return {
      articleId: candidate.platformRefId,
      articleUrl: candidate.url,
      articleTitle: candidate.title,
      articleSource: candidate.sourceType,
      eventDate: parsed.eventDate?.slice(0, 10) ?? null,
      eventDateConfidence: parsed.eventDateConfidence ?? 'low',
      canonicalEventTitle: parsed.canonicalEventTitle.slice(0, 120),
      eventSummary: parsed.eventSummary ?? candidate.summary?.slice(0, 300) ?? '',
      entities: (parsed.entities ?? []).slice(0, 8),
      geography: (parsed.geography ?? []).slice(0, 5),
      extractedAt: new Date().toISOString(),
      rawSnippet: candidate.summary?.slice(0, 400) ?? '',
      sourceType: candidate.sourceType,
      platformRefType: candidate.platformRefType,
      platformRefId: candidate.platformRefId,
      regionTags: candidate.regionTags,
      sectorTags: candidate.sectorTags,
      relevanceScore: candidate.relevanceScore,
    }
  } catch (err) {
    console.error(`[article-extractor] Failed to extract event from "${candidate.title.slice(0, 50)}":`, err)
    return null
  }
}

/**
 * Extract events from a batch of candidates using LLM.
 * Runs up to BATCH_CONCURRENCY extractions in parallel.
 */
export async function extractEventsFromCandidates(
  candidates: CandidateItem[],
  maxItems = 30,
): Promise<ExtractedEvent[]> {
  const toProcess = candidates.slice(0, maxItems)
  const results: ExtractedEvent[] = []

  for (let i = 0; i < toProcess.length; i += BATCH_CONCURRENCY) {
    const batch = toProcess.slice(i, i + BATCH_CONCURRENCY)
    const batchResults = await Promise.allSettled(batch.map(c => extractSingle(c)))

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value)
      }
    }
  }

  console.log(`[article-extractor] Extracted ${results.length} events from ${toProcess.length} candidates`)
  return results
}
