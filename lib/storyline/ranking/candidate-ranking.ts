// ============================================================================
// CandidateRankingService
// Scores, ranks, deduplicates, and prunes candidate articles/events into the
// final set used for storyline construction.
// Critically: past-event ranking prioritizes explanatory value over recency.
// ============================================================================

import type {
  StorylineAnchor,
  RetrievalCandidate,
  RankedCandidate,
  RetrievalTimeWindow,
  TimeWindowConfig,
  TIME_WINDOW_CONFIGS,
} from '../types'

// ── Temporal classification ──────────────────────────────────────────────────

function classifyTemporalPosition(
  candidateDate: string | undefined,
  anchorDate: string | undefined,
): { position: RankedCandidate['temporalPosition']; deltaDays: number | null } {
  if (!candidateDate || !anchorDate) return { position: 'unknown', deltaDays: null }

  const cDate = new Date(candidateDate)
  const aDate = new Date(anchorDate)
  if (isNaN(cDate.getTime()) || isNaN(aDate.getTime())) return { position: 'unknown', deltaDays: null }

  const deltaDays = Math.round((cDate.getTime() - aDate.getTime()) / (1000 * 60 * 60 * 24))

  if (deltaDays < -1) return { position: 'past', deltaDays }
  if (deltaDays > 1) return { position: 'future', deltaDays }
  return { position: 'concurrent', deltaDays }
}

function assignTimeWindow(deltaDays: number | null): RetrievalTimeWindow | undefined {
  if (deltaDays === null) return undefined
  const absDays = Math.abs(deltaDays)
  if (absDays <= 7) return 'immediate'
  if (absDays <= 30) return 'recent'
  if (absDays <= 180) return 'medium'
  if (absDays <= 730) return 'long'
  return 'archival'
}

// ── Scoring functions ────────────────────────────────────────────────────────

function computeTextRelevance(candidate: RetrievalCandidate, anchor: StorylineAnchor): number {
  const text = (candidate.title + ' ' + candidate.snippet).toLowerCase()
  const anchorText = (anchor.title + ' ' + anchor.summary).toLowerCase()

  const anchorTokens = anchorText
    .split(/[\s\-_/,.;:!?']+/)
    .filter(t => t.length >= 3)

  const uniqueTokens = [...new Set(anchorTokens)]
  let hits = 0
  for (const token of uniqueTokens) {
    if (text.includes(token)) hits++
  }

  return uniqueTokens.length > 0 ? hits / uniqueTokens.length : 0
}

function computeEntityOverlapScore(candidate: RetrievalCandidate): number {
  return Math.min(candidate.entityOverlap.length / 3, 1)
}

function computeGeographyScore(candidate: RetrievalCandidate): number {
  return Math.min(candidate.regionOverlap.length / 2, 1)
}

function computeSectorScore(candidate: RetrievalCandidate): number {
  return Math.min(candidate.sectorOverlap.length / 2, 1)
}

/**
 * For PAST events: explanatory value heavily outweighs recency.
 * Older events that are highly relevant get HIGHER scores, not lower.
 */
function computeExplanatoryValue(
  textRelevance: number,
  entityOverlap: number,
  geographyScore: number,
  sectorScore: number,
  trustScore: number,
  temporalPosition: RankedCandidate['temporalPosition'],
  deltaDays: number | null,
): number {
  // Base explanatory score from content signals
  const contentScore = (
    textRelevance * 0.35 +
    entityOverlap * 0.25 +
    geographyScore * 0.15 +
    sectorScore * 0.1 +
    trustScore * 0.15
  )

  if (temporalPosition !== 'past') return contentScore

  // For past events: bonus for temporal depth when content relevance is high
  // This counteracts recency bias: older events get a depth bonus
  if (deltaDays !== null && contentScore > 0.3) {
    const absDays = Math.abs(deltaDays)
    let depthBonus = 0
    if (absDays > 365) depthBonus = 0.15       // >1 year: significant depth bonus
    else if (absDays > 180) depthBonus = 0.1    // >6 months
    else if (absDays > 30) depthBonus = 0.05    // >1 month
    return Math.min(contentScore + depthBonus, 1)
  }

  return contentScore
}

/**
 * Causal precursor scoring: how likely is this event a cause of the anchor?
 * Uses heuristic signals (temporal cues, entity continuity, event type patterns).
 */
function computeCausalPrecursorScore(
  candidate: RetrievalCandidate,
  anchor: StorylineAnchor,
  temporalPosition: RankedCandidate['temporalPosition'],
): number {
  if (temporalPosition !== 'past') return 0

  let score = 0
  const text = (candidate.title + ' ' + candidate.snippet).toLowerCase()

  // Causal language cues
  const causalCues = [
    'a provoqué', 'a entraîné', 'a conduit à', 'a déclenché',
    'a causé', 'suite à', 'en raison de', 'à cause de',
    'conséquence de', 'résultat de', 'après la décision',
    'triggered', 'led to', 'caused', 'resulted in', 'following',
    'décision de', 'politique de', 'réforme', 'accord', 'traité',
    'sanctions', 'embargo', 'élection', 'nomination', 'loi',
  ]
  for (const cue of causalCues) {
    if (text.includes(cue)) { score += 0.15; break }
  }

  // Entity continuity (same actors = higher causal likelihood)
  if (candidate.entityOverlap.length >= 2) score += 0.3
  else if (candidate.entityOverlap.length >= 1) score += 0.15

  // Geography continuity
  if (candidate.regionOverlap.length > 0) score += 0.15

  // Sector continuity
  if (candidate.sectorOverlap.length > 0) score += 0.1

  // Source trust
  score += candidate.trustScore * 0.15

  return Math.min(score, 1)
}

// ── Deduplication ────────────────────────────────────────────────────────────

function computeDedupHash(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
}

function isDuplicate(candidate: RetrievalCandidate, existing: RankedCandidate[]): boolean {
  const hash = computeDedupHash(candidate.title)
  for (const ex of existing) {
    const exHash = computeDedupHash(ex.title)
    if (hash === exHash) return true
    if (candidate.url && ex.url && candidate.url === ex.url) return true
    // Fuzzy title similarity
    if (hash.length > 20 && exHash.length > 20) {
      const overlap = computeTokenOverlap(hash, exHash)
      if (overlap > 0.8) return true
    }
  }
  return false
}

function computeTokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(t => t.length >= 3))
  const tokensB = new Set(b.split(' ').filter(t => t.length >= 3))
  if (tokensA.size === 0 || tokensB.size === 0) return 0
  let overlap = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++
  }
  return overlap / Math.max(tokensA.size, tokensB.size)
}

// ── Main ranking pipeline ────────────────────────────────────────────────────

export function rankCandidates(
  candidates: RetrievalCandidate[],
  anchor: StorylineAnchor,
  maxResults: number = 30,
): RankedCandidate[] {
  const ranked: RankedCandidate[] = []

  for (const candidate of candidates) {
    const { position, deltaDays } = classifyTemporalPosition(
      candidate.publishedAt,
      anchor.publishedAt,
    )

    const textRelevance = computeTextRelevance(candidate, anchor)
    const entityOverlap = computeEntityOverlapScore(candidate)
    const geographyScore = computeGeographyScore(candidate)
    const sectorScore = computeSectorScore(candidate)

    const explanatoryValue = computeExplanatoryValue(
      textRelevance, entityOverlap, geographyScore, sectorScore,
      candidate.trustScore, position, deltaDays,
    )

    const causalPrecursorScore = computeCausalPrecursorScore(candidate, anchor, position)

    const isDup = isDuplicate(candidate, ranked)

    // Composite relevance score
    // For PAST events: explanatory value (40%) + causal (25%) + entity (15%) + trust (10%) + text (10%)
    // For other events: text relevance (35%) + entity (20%) + geography (15%) + sector (10%) + trust (20%)
    let relevanceScore: number
    if (position === 'past') {
      relevanceScore = (
        explanatoryValue * 0.4 +
        causalPrecursorScore * 0.25 +
        entityOverlap * 0.15 +
        candidate.trustScore * 0.1 +
        textRelevance * 0.1
      )
    } else {
      relevanceScore = (
        textRelevance * 0.35 +
        entityOverlap * 0.2 +
        geographyScore * 0.15 +
        sectorScore * 0.1 +
        candidate.trustScore * 0.2
      )
    }

    ranked.push({
      ...candidate,
      relevanceScore,
      explanatoryValue,
      causalPrecursorScore,
      temporalPosition: position,
      timeWindow: assignTimeWindow(deltaDays),
      isDuplicate: isDup,
    })
  }

  // Sort: non-duplicates first, then by relevance
  ranked.sort((a, b) => {
    if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? 1 : -1
    return b.relevanceScore - a.relevanceScore
  })

  // Prune duplicates and low-relevance candidates
  const filtered = ranked.filter(c => !c.isDuplicate && c.relevanceScore > 0.1)

  // Ensure time window diversity for past events
  return ensureTimeWindowDiversity(filtered, maxResults)
}

/**
 * Ensures the final set includes candidates from multiple time windows,
 * preventing recency bias in the "past" side of the storyline.
 */
function ensureTimeWindowDiversity(
  candidates: RankedCandidate[],
  maxResults: number,
): RankedCandidate[] {
  const past = candidates.filter(c => c.temporalPosition === 'past')
  const other = candidates.filter(c => c.temporalPosition !== 'past')

  // Allocate slots across time windows for past events
  const windowSlots: Record<string, number> = {
    immediate: 3,
    recent: 3,
    medium: 3,
    long: 2,
    archival: 2,
  }

  const pastSelected: RankedCandidate[] = []
  for (const [window, maxSlots] of Object.entries(windowSlots)) {
    const windowCandidates = past.filter(c => c.timeWindow === window)
    pastSelected.push(...windowCandidates.slice(0, maxSlots))
  }

  // Add remaining past candidates by relevance if slots remain
  const pastIds = new Set(pastSelected.map(c => c.title))
  const remainingPast = past.filter(c => !pastIds.has(c.title))

  const pastBudget = Math.floor(maxResults * 0.6)
  if (pastSelected.length < pastBudget) {
    pastSelected.push(...remainingPast.slice(0, pastBudget - pastSelected.length))
  }

  // Combine with non-past candidates
  const otherBudget = maxResults - Math.min(pastSelected.length, pastBudget)
  const result = [...pastSelected.slice(0, pastBudget), ...other.slice(0, otherBudget)]

  return result.slice(0, maxResults)
}
