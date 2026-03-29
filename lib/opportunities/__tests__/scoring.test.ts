/**
 * Tests unitaires — Moteur de scoring des opportunités
 *
 * Lancer : npx tsx lib/opportunities/__tests__/scoring.test.ts
 * Ou avec un test runner si configuré (jest, vitest).
 */

import {
  computeFitScore,
  computeIntentScore,
  computeRecencyScore,
  computeEngagementScore,
  computeReachabilityScore,
  computeNoisePenalty,
  computeFullScore,
  getHeatLevel,
  computeConfidenceScore,
  type ScoringInput,
  type FitInput,
  type SignalInput,
  type ContactInput,
} from '../scoring'

// ── Helpers ──

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${label}`)
  }
}

function assertRange(value: number, min: number, max: number, label: string) {
  assert(value >= min && value <= max, `${label} → ${value} ∈ [${min}, ${max}]`)
}

// ── Tests fitScore ──

console.log('\n── fitScore ──')

const perfectFit: FitInput = {
  sectorMatch: true, subSectorMatch: true, countryMatch: true,
  sizeMatch: true, companyTypeMatch: true, keywordMatches: 4,
}
const fitResult = computeFitScore(perfectFit)
assertRange(fitResult.score, 90, 100, 'Perfect fit score >= 90')
assert(fitResult.reasons.length > 0, 'Perfect fit has reasons')

const zeroFit: FitInput = {
  sectorMatch: false, subSectorMatch: false, countryMatch: false,
  sizeMatch: false, companyTypeMatch: false, keywordMatches: 0,
}
const zeroFitResult = computeFitScore(zeroFit)
assert(zeroFitResult.score === 0, 'Zero fit gives 0')

// ── Tests intentScore ──

console.log('\n── intentScore ──')

const multipleSignals: SignalInput[] = [
  { id: '1', type: 'tender_detected', detectedAt: new Date().toISOString(), confidenceScore: 0.8 },
  { id: '2', type: 'hiring_spike', detectedAt: new Date().toISOString(), confidenceScore: 0.6 },
  { id: '3', type: 'expansion_plan', detectedAt: new Date().toISOString(), confidenceScore: 0.7 },
]
const intentResult = computeIntentScore(multipleSignals, ['BTP'])
assertRange(intentResult.score, 50, 100, 'Multiple signals give high intent')
assert(intentResult.reasons.some(r => r.label.includes('Convergence')), 'Convergence bonus detected')

const noSignals = computeIntentScore([], ['BTP'])
assert(noSignals.score === 0, 'No signals gives 0 intent')

// ── Tests recencyScore ──

console.log('\n── recencyScore ──')

const recentSignal: SignalInput[] = [
  { id: '1', type: 'tender_detected', detectedAt: new Date().toISOString(), confidenceScore: 0.8 },
]
const recencyRecent = computeRecencyScore(recentSignal)
assert(recencyRecent.score === 100, 'Today signal gives recency 100')

const oldDate = new Date()
oldDate.setDate(oldDate.getDate() - 120)
const oldSignal: SignalInput[] = [
  { id: '1', type: 'tender_detected', detectedAt: oldDate.toISOString(), confidenceScore: 0.8 },
]
const recencyOld = computeRecencyScore(oldSignal)
assert(recencyOld.score === 10, 'Old signal (>90j) gives recency 10')

// ── Tests engagementScore ──

console.log('\n── engagementScore ──')

assert(computeEngagementScore('none').score === 20, 'No engagement = 20')
assert(computeEngagementScore('low').score === 35, 'Low engagement = 35')
assert(computeEngagementScore('medium').score === 60, 'Medium engagement = 60')
assert(computeEngagementScore('high').score === 85, 'High engagement = 85')

// ── Tests reachabilityScore ──

console.log('\n── reachabilityScore ──')

const fullContacts: ContactInput[] = [
  { hasEmail: true, hasPhone: true, hasLinkedin: true, isDecisionMaker: true },
  { hasEmail: true, hasPhone: false, hasLinkedin: false, isDecisionMaker: false },
]
const reachFull = computeReachabilityScore(fullContacts)
assert(reachFull.score === 100, 'Full contacts give 100 reachability')

const noContacts = computeReachabilityScore([])
assert(noContacts.score === 0, 'No contacts = 0 reachability')

// ── Tests noisePenalty ──

console.log('\n── noisePenalty ──')

const noisySignals: SignalInput[] = [
  { id: '1', type: 'unknown_type', detectedAt: new Date().toISOString(), confidenceScore: 0.1 },
  { id: '2', type: 'another_unknown', detectedAt: new Date().toISOString(), confidenceScore: 0.2 },
]
const noiseResult = computeNoisePenalty(noisySignals, 0.2)
assert(noiseResult.score > 0, 'Noisy signals incur penalty')
assertRange(noiseResult.score, 10, 40, 'Noise penalty in range')

// ── Tests computeFullScore ──

console.log('\n── computeFullScore ──')

const hotLead: ScoringInput = {
  fit: perfectFit,
  signals: multipleSignals,
  contacts: fullContacts,
  userSectors: ['BTP'],
  engagementLevel: 'high',
  companyDataCompleteness: 0.9,
}
const hotResult = computeFullScore(hotLead)
assertRange(hotResult.final, 75, 100, 'Hot lead score >= 75')
assert(getHeatLevel(hotResult.final) === 'hot', 'Hot lead classified as hot')

const coldLead: ScoringInput = {
  fit: zeroFit,
  signals: [],
  contacts: [],
  userSectors: [],
  engagementLevel: 'none',
  companyDataCompleteness: 0.2,
}
const coldResult = computeFullScore(coldLead)
assertRange(coldResult.final, 0, 30, 'Cold lead score < 30')
assert(getHeatLevel(coldResult.final) === 'cold', 'Cold lead classified as cold')

// ── Tests heat levels ──

console.log('\n── heatLevel ──')

assert(getHeatLevel(80) === 'hot', '80 = hot')
assert(getHeatLevel(75) === 'hot', '75 = hot (boundary)')
assert(getHeatLevel(60) === 'warm', '60 = warm')
assert(getHeatLevel(50) === 'warm', '50 = warm (boundary)')
assert(getHeatLevel(30) === 'cold', '30 = cold')
assert(getHeatLevel(0) === 'cold', '0 = cold')

// ── Tests confidenceScore ──

console.log('\n── confidenceScore ──')

const confHigh = computeConfidenceScore(multipleSignals, 0.9)
assertRange(confHigh, 50, 100, 'High confidence signals + data = high confidence')

const confLow = computeConfidenceScore([], 0.1)
assert(confLow === 10, 'No signals = 10 confidence')

// ── Summary ──

console.log(`\n═══════════════════════════════`)
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`═══════════════════════════════\n`)

if (failed > 0) process.exit(1)
