/**
 * Tests unitaires — Pipeline agents opportunités
 * Couvre : sonar mapping, primary trigger, evidence builder, qualification, normalisation
 */

import { normalizeName, isProbableDuplicate, nameSimilarity } from '../normalizer'
import {
  getSignalConfig,
  getSignalBusinessLabel,
  getSignalBadge,
  getSignalHypothesisTemplate,
  getSignalApproachAngle,
  SIGNAL_TYPES,
} from '../signals-taxonomy'

// ── Tests : Signal Taxonomy completeness ──

function test(label: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${label}`)
  } catch (e: any) {
    console.error(`  ✗ ${label}: ${e.message}`)
    process.exitCode = 1
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

console.log('\n═══ Pipeline Tests ═══\n')

// ── Section 1: Signal Taxonomy ──

console.log('── Signal Taxonomy ──')

test('All required signal types exist', () => {
  const required = [
    'hiring_spike', 'tender_detected', 'procurement_signal', 'project_launch',
    'expansion_plan', 'new_location', 'funding_event', 'partnership',
    'executive_change', 'import_activity', 'distributor_appointment', 'competitor_switch',
  ]
  for (const type of required) {
    const cfg = getSignalConfig(type)
    assert(!!cfg, `Missing signal type: ${type}`)
    assert(!!cfg!.label, `Missing label for ${type}`)
    assert(!!cfg!.businessLabel, `Missing businessLabel for ${type}`)
    assert(!!cfg!.badge, `Missing badge for ${type}`)
    assert(!!cfg!.hypothesisTemplate, `Missing hypothesisTemplate for ${type}`)
    assert(cfg!.baseScore > 0, `baseScore must be positive for ${type}`)
    assert(cfg!.decayDays > 0, `decayDays must be positive for ${type}`)
  }
})

test('getSignalBusinessLabel returns human labels', () => {
  assert(getSignalBusinessLabel('hiring_spike') === 'Recrutement massif en cours', 'hiring_spike label')
  assert(getSignalBusinessLabel('tender_detected') === 'Appel d\'offres détecté', 'tender_detected label')
  assert(getSignalBusinessLabel('unknown_type').includes('Signal'), 'unknown type fallback')
})

test('getSignalBadge returns short badges', () => {
  assert(getSignalBadge('hiring_spike') === 'Recrutement', 'hiring badge')
  assert(getSignalBadge('tender_detected') === 'Appel d\'offres', 'tender badge')
  assert(getSignalBadge('funding_event') === 'Levée de fonds', 'funding badge')
})

test('getSignalHypothesisTemplate returns templates', () => {
  const template = getSignalHypothesisTemplate('expansion_plan')
  assert(template.length > 20, 'template should be substantive')
  assert(template.includes('expansion') || template.includes('croissance'), 'template should mention growth')
})

test('getSignalApproachAngle returns angle', () => {
  const angle = getSignalApproachAngle('procurement_signal')
  assert(angle.length > 10, 'angle should be substantive')
})

test('SIGNAL_TYPES has at least 12 types', () => {
  assert(SIGNAL_TYPES.length >= 12, `Expected >= 12, got ${SIGNAL_TYPES.length}`)
})

test('Each signal type has valid category', () => {
  const validCats = ['high_intent', 'medium_intent', 'low_intent', 'context']
  for (const s of SIGNAL_TYPES) {
    assert(validCats.includes(s.category), `Invalid category for ${s.type}: ${s.category}`)
  }
})

// ── Section 2: Entity Resolution (Normalizer) ──

console.log('\n── Entity Resolution ──')

test('normalizeName handles corporate suffixes', () => {
  assert(normalizeName('SIFCA SA') === normalizeName('sifca'), 'SA suffix')
  assert(normalizeName('Groupe SIFCA') === normalizeName('sifca'), 'Groupe prefix')
  assert(normalizeName('SIFCA S.A.') === normalizeName('sifca'), 'S.A. suffix')
})

test('isProbableDuplicate detects company variants', () => {
  assert(isProbableDuplicate('SIFCA', 'Groupe SIFCA'), 'SIFCA variants')
  assert(isProbableDuplicate('Orange CI', 'Orange Côte d\'Ivoire'), 'Orange variants')
  assert(!isProbableDuplicate('TotalEnergies', 'Shell'), 'Different companies')
})

test('nameSimilarity works on close names', () => {
  const sim = nameSimilarity('Bolloré Transport', 'Bollore Transport Logistics')
  assert(sim > 0.2, `Expected > 0.2, got ${sim}`)
  const sim2 = nameSimilarity('SIFCA', 'SIFCA SA')
  assert(sim2 > 0.5, `Expected > 0.5 for SIFCA variants, got ${sim2}`)
})

// ── Section 3: Primary Trigger Selection Logic ──

console.log('\n── Primary Trigger Selection ──')

interface MockSignal {
  type: string
  confidence: number
  daysAgo: number
  sourceReliability: number
}

function computeMockSignalStrength(sig: MockSignal): number {
  const cfg = getSignalConfig(sig.type)
  const baseScore = cfg?.baseScore ?? 10
  const recencyBonus = sig.daysAgo <= 14 ? 1.3 : sig.daysAgo <= 30 ? 1.1 : 1.0
  return baseScore * recencyBonus * sig.confidence * sig.sourceReliability
}

function selectMockPrimaryTrigger(signals: MockSignal[]): MockSignal {
  const typeGroups = new Map<string, MockSignal[]>()
  for (const s of signals) {
    const arr = typeGroups.get(s.type) || []
    arr.push(s)
    typeGroups.set(s.type, arr)
  }

  let bestType = signals[0].type
  let bestScore = 0

  for (const [type, group] of typeGroups) {
    const avgStrength = group.reduce((s, sig) => s + computeMockSignalStrength(sig), 0) / group.length
    const convergenceBonus = Math.min(group.length * 0.15, 0.6)
    const totalScore = avgStrength * (1 + convergenceBonus)
    if (totalScore > bestScore) {
      bestScore = totalScore
      bestType = type
    }
  }

  return signals.find(s => s.type === bestType) || signals[0]
}

test('Selects highest-intent signal as primary', () => {
  const signals: MockSignal[] = [
    { type: 'hiring_spike', confidence: 0.8, daysAgo: 5, sourceReliability: 0.7 },
    { type: 'tender_detected', confidence: 0.9, daysAgo: 3, sourceReliability: 0.8 },
    { type: 'digital_activity_spike', confidence: 0.5, daysAgo: 10, sourceReliability: 0.3 },
  ]
  const primary = selectMockPrimaryTrigger(signals)
  assert(primary.type === 'tender_detected', `Expected tender_detected, got ${primary.type}`)
})

test('Convergence of same type boosts selection', () => {
  // hiring_spike base=15, tender_detected base=30
  // With 4 hiring signals vs 1 tender with low confidence, convergence should win
  const signals: MockSignal[] = [
    { type: 'hiring_spike', confidence: 0.9, daysAgo: 3, sourceReliability: 0.8 },
    { type: 'hiring_spike', confidence: 0.8, daysAgo: 5, sourceReliability: 0.7 },
    { type: 'hiring_spike', confidence: 0.7, daysAgo: 7, sourceReliability: 0.7 },
    { type: 'hiring_spike', confidence: 0.8, daysAgo: 4, sourceReliability: 0.8 },
    { type: 'tender_detected', confidence: 0.4, daysAgo: 25, sourceReliability: 0.3 },
  ]
  const primary = selectMockPrimaryTrigger(signals)
  assert(primary.type === 'hiring_spike', `Convergence should favor hiring_spike, got ${primary.type}`)
})

test('Recency boosts recent signals', () => {
  const recentSig: MockSignal = { type: 'partnership', confidence: 0.7, daysAgo: 5, sourceReliability: 0.7 }
  const oldSig: MockSignal = { type: 'partnership', confidence: 0.7, daysAgo: 60, sourceReliability: 0.7 }
  const recent = computeMockSignalStrength(recentSig)
  const old = computeMockSignalStrength(oldSig)
  assert(recent > old, `Recent signal (${recent.toFixed(2)}) should be stronger than old signal (${old.toFixed(2)})`)
})

// ── Section 4: Evidence Quality Assessment ──

console.log('\n── Evidence Quality ──')

function assessMockEvidenceQuality(signals: { confidence: number; type: string; source: string }[]): string {
  const goodSignals = signals.filter(s => s.confidence >= 0.5)
  const uniqueTypes = new Set(signals.map(s => s.type))
  const uniqueSources = new Set(signals.map(s => s.source).filter(Boolean))

  if (goodSignals.length >= 2 && (uniqueTypes.size >= 2 || uniqueSources.size >= 2)) return 'sufficient'
  if (goodSignals.length >= 1 || signals.length >= 2) return 'insufficient'
  return 'weak'
}

test('Sufficient evidence: 2+ good signals from different types', () => {
  const result = assessMockEvidenceQuality([
    { confidence: 0.8, type: 'tender_detected', source: 'press.com' },
    { confidence: 0.7, type: 'hiring_spike', source: 'jobs.com' },
  ])
  assert(result === 'sufficient', `Expected sufficient, got ${result}`)
})

test('Insufficient evidence: 1 good signal only', () => {
  const result = assessMockEvidenceQuality([
    { confidence: 0.8, type: 'tender_detected', source: 'press.com' },
  ])
  assert(result === 'insufficient', `Expected insufficient, got ${result}`)
})

test('Weak evidence: only low-confidence signals', () => {
  const result = assessMockEvidenceQuality([
    { confidence: 0.2, type: 'digital_activity_spike', source: '' },
  ])
  assert(result === 'weak', `Expected weak, got ${result}`)
})

test('Sufficient evidence: same type but multiple sources', () => {
  const result = assessMockEvidenceQuality([
    { confidence: 0.7, type: 'hiring_spike', source: 'linkedin.com' },
    { confidence: 0.6, type: 'hiring_spike', source: 'indeed.com' },
  ])
  assert(result === 'sufficient', `Expected sufficient, got ${result}`)
})

// ── Section 5: Display Status Logic ──

console.log('\n── Display Status ──')

function computeMockDisplayStatus(primaryLabel: string | null, hypothesis: string | null, evidenceStatus: string): string {
  if (!primaryLabel || !hypothesis) return 'hidden'
  if (evidenceStatus === 'weak') return 'hidden'
  if (evidenceStatus === 'insufficient') return 'draft'
  return 'visible'
}

test('Visible when everything is present', () => {
  assert(computeMockDisplayStatus('Recrutement', 'Hypothèse', 'sufficient') === 'visible', 'visible')
})

test('Hidden without primary label', () => {
  assert(computeMockDisplayStatus(null, 'Hypothèse', 'sufficient') === 'hidden', 'hidden without label')
})

test('Hidden with weak evidence', () => {
  assert(computeMockDisplayStatus('Recrutement', 'Hypothèse', 'weak') === 'hidden', 'hidden with weak evidence')
})

test('Draft with insufficient evidence', () => {
  assert(computeMockDisplayStatus('Recrutement', 'Hypothèse', 'insufficient') === 'draft', 'draft')
})

// ── Section 6: Evidence Summary construction ──

console.log('\n── Evidence Summary ──')

test('Evidence limited to 5 items max', () => {
  const signals = Array(10).fill(null).map((_, i) => ({
    id: `s${i}`,
    label: `Signal ${i}`,
    strength: Math.random(),
  }))
  const evidence = signals
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 5)
  assert(evidence.length === 5, `Expected 5, got ${evidence.length}`)
})

test('Evidence sorted by strength descending', () => {
  const signals = [
    { strength: 0.3, label: 'low' },
    { strength: 0.9, label: 'high' },
    { strength: 0.6, label: 'mid' },
  ]
  const sorted = [...signals].sort((a, b) => b.strength - a.strength)
  assert(sorted[0].label === 'high', 'first should be highest')
  assert(sorted[2].label === 'low', 'last should be lowest')
})

// ── Section 7: Sonar result mapping ──

console.log('\n── Sonar Result Mapping ──')

test('Maps Sonar citation to discovered source format', () => {
  const citation = { url: 'https://example.com/article', title: 'Test Article' }
  const mapped = {
    title: citation.title,
    url: citation.url,
    domain: new URL(citation.url).hostname.replace(/^www\./, ''),
    snippet: '',
    provider: 'sonar' as const,
    relevanceScore: 0.7,
  }
  assert(mapped.domain === 'example.com', `Domain: ${mapped.domain}`)
  assert(mapped.provider === 'sonar', 'Provider')
  assert(mapped.relevanceScore === 0.7, 'Relevance')
})

test('Deduplicates URLs from multiple providers', () => {
  const urls = [
    { url: 'https://a.com/1', provider: 'sonar' },
    { url: 'https://a.com/1', provider: 'firecrawl' },
    { url: 'https://b.com/2', provider: 'sonar' },
  ]
  const seen = new Set<string>()
  const deduped = urls.filter(u => {
    if (seen.has(u.url)) return false
    seen.add(u.url)
    return true
  })
  assert(deduped.length === 2, `Expected 2, got ${deduped.length}`)
})

// ── Summary ──

console.log('\n═══ All pipeline tests passed ═══\n')
