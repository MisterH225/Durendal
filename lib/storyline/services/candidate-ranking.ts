import type { CandidateItem } from '@/lib/graph/types'

const MAX_CANDIDATES = 40

function normalizeText(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function titleSimilarity(a: string, b: string): number {
  const na = normalizeText(a)
  const nb = normalizeText(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8

  const tokensA = na.split(/\s+/).filter(t => t.length > 2)
  const tokensB = nb.split(/\s+/).filter(t => t.length > 2)
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  let overlap = 0
  for (const t of tokensA) {
    if (tokensB.some(tb => tb.includes(t) || t.includes(tb))) overlap++
  }
  return overlap / Math.max(tokensA.length, tokensB.length)
}

function deduplicateCandidates(candidates: CandidateItem[]): CandidateItem[] {
  const kept: CandidateItem[] = []

  for (const c of candidates) {
    if (c.url) {
      const urlBase = c.url.replace(/[?#].*$/, '').toLowerCase()
      if (kept.some(k => k.url?.replace(/[?#].*$/, '').toLowerCase() === urlBase)) continue
    }

    const isDup = kept.some(k => titleSimilarity(k.title, c.title) > 0.7)
    if (isDup) continue

    kept.push(c)
  }

  return kept
}

function scoreCandidate(
  candidate: CandidateItem,
  anchorKeywords: string[],
  anchorEntities: string[],
): number {
  let score = 0

  const normalTitle = normalizeText(candidate.title)
  const normalSummary = normalizeText(candidate.summary)

  for (const kw of anchorKeywords) {
    const nkw = normalizeText(kw)
    if (normalTitle.includes(nkw)) score += 15
    if (normalSummary.includes(nkw)) score += 5
  }

  for (const ent of anchorEntities) {
    const nent = normalizeText(ent)
    if (normalTitle.includes(nent)) score += 12
    if (normalSummary.includes(nent)) score += 4
    if (candidate.entities?.some(e => normalizeText(e).includes(nent))) score += 8
  }

  if (candidate.trustScore) score += candidate.trustScore * 10
  if (candidate.sourceType === 'internal') score += 5

  const windowBonus: Record<string, number> = {
    immediate: 3,
    recent: 2,
    medium: 4,
    long: 5,
    archival: 6,
  }
  if (candidate.temporalWindow) {
    score += windowBonus[candidate.temporalWindow] ?? 0
  }

  return score
}

export function rankAndPruneCandidates(
  candidates: CandidateItem[],
  anchorKeywords: string[],
  anchorEntities: string[],
): CandidateItem[] {
  const deduped = deduplicateCandidates(candidates)

  const scored = deduped.map(c => ({
    candidate: c,
    score: scoreCandidate(c, anchorKeywords, anchorEntities),
  }))

  scored.sort((a, b) => b.score - a.score)

  const result = scored.slice(0, MAX_CANDIDATES).map(s => ({
    ...s.candidate,
    relevanceScore: s.score,
  }))

  return result
}
