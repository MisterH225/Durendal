import { createAdminClient } from '@/lib/supabase/admin'
import { perplexityResponses } from '@/lib/ai/perplexity'
import type { PerplexityCitation, SearchRecency } from '@/lib/ai/perplexity'
import type { CandidateItem } from '@/lib/graph/types'

const INTERNAL_LIMIT = 25

interface TimeWindow {
  label: string
  recency: SearchRecency
  maxResults: number
  promptFocus: string
}

const TIME_WINDOWS: TimeWindow[] = [
  { label: 'immediate', recency: 'day',   maxResults: 8,  promptFocus: 'immediate precursors and triggers from the last 48 hours' },
  { label: 'recent',    recency: 'week',  maxResults: 6,  promptFocus: 'recent developments from the last 1-2 weeks that directly led to this situation' },
  { label: 'medium',    recency: 'month', maxResults: 5,  promptFocus: 'key decisions, policies, or turning points from the last 1-3 months' },
  { label: 'long',      recency: 'year',  maxResults: 4,  promptFocus: 'major historical milestones and structural causes from the past year' },
  { label: 'archival',  recency: 'year',  maxResults: 3,  promptFocus: 'foundational events, treaties, conflicts, or long-term structural factors that explain the deep roots of this situation, going back years if necessary' },
]

function likeTokens(query: string): string[] {
  return query.toLowerCase().split(/[\s\-_/,.;:!?']+/).filter(t => t.length >= 2)
}

function buildOrFilter(tokens: string[], columns: string[]): string {
  const clauses: string[] = []
  for (const col of columns) {
    for (const t of tokens) clauses.push(`${col}.ilike.%${t}%`)
  }
  return clauses.join(',')
}

export interface AnchorContext {
  title: string
  summary?: string
  keywords: string[]
  entities?: string[]
  date?: string
  url?: string
  platformRefType?: string
  platformRefId?: string
}

export async function retrieveInternalCandidates(
  anchor: AnchorContext,
): Promise<CandidateItem[]> {
  const db = createAdminClient()
  const tokens = likeTokens(anchor.keywords.join(' '))
  if (tokens.length === 0) return []

  const candidates: CandidateItem[] = []
  const orFilter = buildOrFilter(tokens, ['title', 'summary'])

  const [
    { data: signals },
    { data: extSignals },
    { data: fEvents },
    { data: iEvents },
    { data: questions },
  ] = await Promise.all([
    db.from('forecast_signal_feed')
      .select('id, title, summary, signal_type, severity, created_at, region, data')
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(INTERNAL_LIMIT),
    db.from('external_signals')
      .select('id, title, summary, url, published_at, source_name, geography, category_tags, trust_score')
      .or(orFilter)
      .order('published_at', { ascending: false })
      .limit(INTERNAL_LIMIT),
    db.from('forecast_events')
      .select('id, title, description, status, tags, starts_at, created_at')
      .or(buildOrFilter(tokens, ['title', 'description']))
      .order('created_at', { ascending: false })
      .limit(15),
    db.from('intel_events')
      .select('id, title, summary, severity, primary_region, sectors, timeline_anchor, created_at')
      .or(buildOrFilter(tokens, ['title', 'summary']))
      .order('created_at', { ascending: false })
      .limit(15),
    db.from('forecast_questions')
      .select('id, title, description, blended_probability, status, region, tags, created_at')
      .or(buildOrFilter(tokens, ['title', 'description']))
      .order('created_at', { ascending: false })
      .limit(15),
  ])

  for (const s of signals ?? []) {
    const d = s.data as Record<string, unknown> | null
    const pubDate = d?.published_at ?? d?.pubDate ?? d?.pub_date ?? d?.date
    const dateStr = pubDate ? String(pubDate).slice(0, 10) : s.created_at?.slice(0, 10)
    candidates.push({
      title: s.title ?? '',
      summary: s.summary ?? '',
      url: typeof d?.source_url === 'string' ? d.source_url : undefined,
      date: dateStr,
      sourceType: 'internal',
      entities: [],
      regionTags: s.region ? [s.region] : [],
      platformRefType: 'signal',
      platformRefId: s.id,
    })
  }

  for (const es of extSignals ?? []) {
    candidates.push({
      title: es.title ?? '',
      summary: es.summary ?? '',
      url: es.url ?? undefined,
      date: es.published_at?.slice(0, 10),
      sourceType: 'internal',
      entities: [],
      regionTags: es.geography ?? [],
      sectorTags: es.category_tags ?? [],
      trustScore: es.trust_score,
      platformRefType: 'external_signal',
      platformRefId: es.id,
    })
  }

  for (const ev of fEvents ?? []) {
    candidates.push({
      title: ev.title,
      summary: ev.description ?? '',
      date: (ev.starts_at ?? ev.created_at)?.slice(0, 10),
      sourceType: 'internal',
      sectorTags: ev.tags ?? [],
      platformRefType: 'forecast_event',
      platformRefId: ev.id,
    })
  }

  for (const ie of iEvents ?? []) {
    candidates.push({
      title: ie.title,
      summary: ie.summary ?? '',
      date: (ie.timeline_anchor ?? ie.created_at)?.slice(0, 10),
      sourceType: 'internal',
      regionTags: ie.primary_region ? [ie.primary_region] : [],
      sectorTags: ie.sectors ?? [],
      platformRefType: 'intel_event',
      platformRefId: ie.id,
    })
  }

  for (const q of questions ?? []) {
    candidates.push({
      title: q.title,
      summary: q.description ?? '',
      date: q.created_at?.slice(0, 10),
      sourceType: 'internal',
      regionTags: q.region ? [q.region] : [],
      sectorTags: q.tags ?? [],
      platformRefType: 'question',
      platformRefId: q.id,
      trustScore: 0.6,
    })
  }

  return candidates
}

export async function retrieveExternalCandidates(
  anchor: AnchorContext,
  onWindowComplete?: (windowLabel: string, candidates: CandidateItem[]) => void,
): Promise<CandidateItem[]> {
  const anchorDesc = `${anchor.title}. ${anchor.summary ?? ''}`

  const results = await Promise.allSettled(
    TIME_WINDOWS.map(async (window) => {
      const prompt = buildWindowPrompt(anchorDesc, window)
      const { text, citations } = await perplexityResponses(prompt, {
        recency: window.recency,
        languages: ['fr', 'en'],
      })

      const windowCandidates = parsePerplexityResponse(text, citations, window.label)
      if (onWindowComplete) onWindowComplete(window.label, windowCandidates)
      return windowCandidates
    }),
  )

  const allCandidates: CandidateItem[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      allCandidates.push(...result.value)
    } else {
      console.error(`[hybrid-retrieval] Window ${TIME_WINDOWS[i].label} failed:`, result.reason)
    }
  }

  return allCandidates
}

function buildWindowPrompt(anchorDesc: string, window: TimeWindow): string {
  return [
    `You are an intelligence analyst. Given this anchor event/article:`,
    `"${anchorDesc.slice(0, 500)}"`,
    ``,
    `Find ${window.promptFocus}.`,
    ``,
    `For each event/article found, provide:`,
    `- title (concise, max 100 chars)`,
    `- date (YYYY-MM-DD if known)`,
    `- summary (2-3 sentences explaining what happened and why it matters to the anchor)`,
    `- entities (key actors: countries, organizations, people)`,
    `- regions (geographic areas)`,
    ``,
    `Return ONLY a JSON object with a "items" array. No markdown.`,
    `{"items": [{"title":"...","date":"...","summary":"...","entities":["..."],"regions":["..."]}]}`,
    ``,
    `Return up to ${window.maxResults} items. Focus on explanatory relevance, not just recency.`,
    `For the "${window.label}" window, prioritize events that genuinely explain HOW the current situation came to exist.`,
  ].join('\n')
}

function parsePerplexityResponse(
  text: string,
  citations: PerplexityCitation[],
  windowLabel: string,
): CandidateItem[] {
  const candidates: CandidateItem[] = []

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const items = parsed.items ?? parsed.results ?? []
      for (const item of items) {
        if (!item.title) continue
        candidates.push({
          title: item.title,
          summary: item.summary ?? item.description ?? '',
          date: item.date ?? undefined,
          sourceType: 'perplexity',
          temporalWindow: windowLabel,
          entities: item.entities ?? [],
          regionTags: item.regions ?? item.geography ?? [],
        })
      }
    }
  } catch {
    // JSON parsing failed — extract what we can from text
  }

  if (candidates.length === 0 && text.length > 50) {
    candidates.push({
      title: `${windowLabel}: contexte`,
      summary: text.slice(0, 500),
      sourceType: 'perplexity',
      temporalWindow: windowLabel,
    })
  }

  for (const cit of citations) {
    const existing = candidates.find(c => c.url === cit.url)
    if (existing && !existing.url) existing.url = cit.url
    if (existing) continue
    if (cit.url && !candidates.some(c => c.title === cit.title)) {
      const citAny = cit as unknown as Record<string, unknown>
      candidates.push({
        title: cit.title || cit.url,
        summary: '',
        url: cit.url,
        date: citAny.published_date
          ? String(citAny.published_date).slice(0, 10)
          : undefined,
        sourceType: 'perplexity',
        temporalWindow: windowLabel,
      })
    }
  }

  return candidates
}
