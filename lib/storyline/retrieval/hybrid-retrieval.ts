// ============================================================================
// HybridRetrievalService
// Combines internal platform data + external internet search to build a broad
// candidate pool for storyline construction.
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { callGeminiWithSearch } from '@/lib/ai/gemini'
import type {
  StorylineAnchor,
  RetrievalCandidate,
  TimeWindowConfig,
} from '../types'

// ── Internal platform retrieval ──────────────────────────────────────────────

export async function retrieveFromPlatform(
  anchor: StorylineAnchor,
  timeWindowConfigs: TimeWindowConfig[],
): Promise<RetrievalCandidate[]> {
  const db = createAdminClient()
  const candidates: RetrievalCandidate[] = []
  const keywords = [...anchor.keywords, ...anchor.entities].filter(Boolean)

  if (keywords.length === 0) return candidates

  const tokens = keywords
    .flatMap(k => k.toLowerCase().split(/[\s\-_]+/))
    .filter(t => t.length >= 3)
    .slice(0, 8)

  if (tokens.length === 0) return candidates

  const orFilter = tokens.map(t => `title.ilike.%${t}%,summary.ilike.%${t}%`).join(',')

  // Search forecast_signal_feed
  const { data: signals } = await db
    .from('forecast_signal_feed')
    .select('id, title, summary, signal_type, severity, created_at, region, data')
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(50)

  for (const s of signals ?? []) {
    const sourceUrl = s.data?.source_url ?? s.data?.url ?? null
    candidates.push({
      title: s.title ?? '',
      url: typeof sourceUrl === 'string' ? sourceUrl : undefined,
      snippet: s.summary ?? '',
      publishedAt: s.created_at,
      source: 'platform_signal',
      sourceId: String(s.id),
      trustScore: 0.7,
      entityOverlap: computeOverlap(s.title + ' ' + (s.summary ?? ''), anchor.entities),
      regionOverlap: s.region && anchor.regions.includes(s.region) ? [s.region] : [],
      sectorOverlap: [],
    })
  }

  // Search external_signals
  const { data: extSignals } = await db
    .from('external_signals')
    .select('id, title, summary, url, published_at, source_name, geography, entity_tags, category_tags, trust_score')
    .or(tokens.map(t => `title.ilike.%${t}%,summary.ilike.%${t}%`).join(','))
    .order('published_at', { ascending: false })
    .limit(50)

  for (const es of extSignals ?? []) {
    candidates.push({
      title: es.title ?? '',
      url: es.url ?? undefined,
      snippet: es.summary ?? '',
      publishedAt: es.published_at,
      source: 'external_signal',
      sourceId: String(es.id),
      trustScore: es.trust_score ?? 0.5,
      entityOverlap: computeOverlap(es.title + ' ' + (es.summary ?? ''), anchor.entities),
      regionOverlap: (es.geography ?? []).filter((g: string) => anchor.regions.includes(g)),
      sectorOverlap: (es.category_tags ?? []).filter((c: string) => anchor.sectors.includes(c)),
    })
  }

  // Search forecast_events
  const { data: fEvents } = await db
    .from('forecast_events')
    .select('id, title, description, status, tags, created_at')
    .or(tokens.map(t => `title.ilike.%${t}%,description.ilike.%${t}%`).join(','))
    .order('created_at', { ascending: false })
    .limit(30)

  for (const ev of fEvents ?? []) {
    candidates.push({
      title: ev.title ?? '',
      snippet: ev.description ?? '',
      publishedAt: ev.created_at,
      source: 'platform_event',
      sourceId: ev.id,
      trustScore: 0.8,
      entityOverlap: computeOverlap(ev.title + ' ' + (ev.description ?? ''), anchor.entities),
      regionOverlap: [],
      sectorOverlap: (ev.tags ?? []).filter((t: string) => anchor.sectors.includes(t)),
    })
  }

  // Search forecast_questions
  const { data: questions } = await db
    .from('forecast_questions')
    .select('id, title, description, blended_probability, region, tags, created_at')
    .or(tokens.map(t => `title.ilike.%${t}%,description.ilike.%${t}%`).join(','))
    .order('created_at', { ascending: false })
    .limit(20)

  for (const q of questions ?? []) {
    candidates.push({
      title: q.title ?? '',
      snippet: q.description ?? '',
      publishedAt: q.created_at,
      source: 'platform_question',
      sourceId: q.id,
      trustScore: 0.85,
      entityOverlap: computeOverlap(q.title + ' ' + (q.description ?? ''), anchor.entities),
      regionOverlap: q.region && anchor.regions.includes(q.region) ? [q.region] : [],
      sectorOverlap: (q.tags ?? []).filter((t: string) => anchor.sectors.includes(t)),
    })
  }

  return candidates
}

// ── External retrieval (internet search) ─────────────────────────────────────

export async function retrieveFromInternet(
  anchor: StorylineAnchor,
  timeWindowConfigs: TimeWindowConfig[],
): Promise<RetrievalCandidate[]> {
  const candidates: RetrievalCandidate[] = []

  // Try Perplexity first, fall back to Gemini grounding
  const perplexityAvailable = !!process.env.PERPLEXITY_API_KEY

  // Build queries for each time window
  for (const twc of timeWindowConfigs) {
    const queries = buildTimeWindowQueries(anchor, twc)

    for (const query of queries) {
      try {
        if (perplexityAvailable) {
          const results = await retrieveViaPerplexity(query, twc)
          candidates.push(...results)
        } else {
          const results = await retrieveViaGeminiGrounding(query, twc, anchor)
          candidates.push(...results)
        }
      } catch (err) {
        console.warn(`[storyline/retrieval] ${twc.window} query failed:`, err)
        // Fall through to next query/window
      }
    }
  }

  return candidates
}

async function retrieveViaPerplexity(
  query: string,
  twc: TimeWindowConfig,
): Promise<RetrievalCandidate[]> {
  const { perplexityResponses } = await import('@/lib/ai/perplexity')

  const recencyMap: Record<string, 'day' | 'week' | 'month' | 'year'> = {
    immediate: 'week',
    recent: 'month',
    medium: 'year',
    long: 'year',
    archival: 'year',
  }

  const { text, citations } = await perplexityResponses(query, {
    recency: recencyMap[twc.window],
    languages: ['fr', 'en'],
  })

  return citations.map(c => ({
    title: c.title || query.slice(0, 80),
    url: c.url,
    snippet: text.slice(0, 300),
    source: 'perplexity' as const,
    trustScore: 0.6,
    entityOverlap: [],
    regionOverlap: [],
    sectorOverlap: [],
  }))
}

async function retrieveViaGeminiGrounding(
  query: string,
  twc: TimeWindowConfig,
  anchor: StorylineAnchor,
): Promise<RetrievalCandidate[]> {
  const prompt = `Recherche des événements et articles liés à : "${query}"

Contexte : ${anchor.summary}
Période ciblée : ${twc.label}

Liste les événements les plus importants avec leurs sources (URLs).
Formate en JSON : [{"title": "...", "url": "...", "snippet": "...", "date": "YYYY-MM-DD"}]
Retourne uniquement le JSON.`

  const { text, sources } = await callGeminiWithSearch(prompt, {
    maxOutputTokens: 3000,
  })

  const candidates: RetrievalCandidate[] = []

  // Extract from grounding sources
  for (const s of sources) {
    candidates.push({
      title: s.title,
      url: s.url,
      snippet: '',
      source: 'gemini_grounding',
      trustScore: 0.55,
      entityOverlap: [],
      regionOverlap: [],
      sectorOverlap: [],
    })
  }

  // Try parsing structured output
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      for (const item of parsed) {
        if (item.title && !candidates.some(c => c.url === item.url)) {
          candidates.push({
            title: item.title,
            url: item.url,
            snippet: item.snippet ?? '',
            publishedAt: item.date,
            source: 'gemini_grounding',
            trustScore: 0.55,
            entityOverlap: [],
            regionOverlap: [],
            sectorOverlap: [],
          })
        }
      }
    }
  } catch {
    // Structured parsing failed, we still have grounding sources
  }

  return candidates
}

// ── Query building for time-aware retrieval ──────────────────────────────────

function buildTimeWindowQueries(
  anchor: StorylineAnchor,
  twc: TimeWindowConfig,
): string[] {
  const queries: string[] = []
  const entityStr = anchor.entities.slice(0, 3).join(', ')
  const regionStr = anchor.regions.slice(0, 2).join(', ')

  switch (twc.window) {
    case 'immediate':
      queries.push(
        `Derniers développements : ${anchor.title}`,
      )
      if (entityStr) {
        queries.push(`${entityStr} actualités récentes ${regionStr}`)
      }
      break

    case 'recent':
      queries.push(
        `Événements des dernières semaines menant à : ${anchor.title}`,
      )
      break

    case 'medium':
      queries.push(
        `Contexte et précurseurs (derniers mois) de : ${anchor.title}`,
      )
      if (entityStr) {
        queries.push(`${entityStr} décisions politiques économiques ${regionStr} 2024 2025`)
      }
      break

    case 'long':
      queries.push(
        `Origines historiques et causes profondes de : "${anchor.keywords.slice(0, 3).join(' ')}" ${regionStr}`,
      )
      if (anchor.sectors.length > 0) {
        queries.push(`${anchor.sectors[0]} ${regionStr} historique évolution crises`)
      }
      break

    case 'archival':
      queries.push(
        `Événements fondateurs et contexte historique : ${anchor.keywords.slice(0, 2).join(' ')} ${regionStr} histoire`,
      )
      break
  }

  return queries
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeOverlap(text: string, targets: string[]): string[] {
  const lower = text.toLowerCase()
  return targets.filter(t => lower.includes(t.toLowerCase()))
}

// ── Main retrieval orchestrator ──────────────────────────────────────────────

export async function hybridRetrieve(
  anchor: StorylineAnchor,
  timeWindowConfigs: TimeWindowConfig[],
): Promise<RetrievalCandidate[]> {
  const [platformResults, internetResults] = await Promise.all([
    retrieveFromPlatform(anchor, timeWindowConfigs),
    retrieveFromInternet(anchor, timeWindowConfigs).catch(err => {
      console.warn('[storyline/retrieval] External retrieval failed, using platform only:', err)
      return [] as RetrievalCandidate[]
    }),
  ])

  return [...platformResults, ...internetResults]
}
