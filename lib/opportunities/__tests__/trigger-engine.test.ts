/**
 * Tests unitaires — Trigger Engine
 */

import {
  determinePrimaryTrigger,
  generateBusinessHypothesis,
  buildOpportunityReason,
  buildEvidenceSummary,
  assessEvidenceQuality,
  determineDisplayStatus,
  computeTriggerConfidence,
  computeTriggerData,
  type RawSignal,
} from '../trigger-engine'

let passed = 0
let failed = 0
function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`) }
}

// ── Test data ──

const now = new Date().toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const hiringSignals: RawSignal[] = [
  { id: '1', type: 'hiring_spike', title: 'Recrutement de 4 sales managers', detectedAt: daysAgo(3), confidenceScore: 0.8, sourceName: 'LinkedIn' },
  { id: '2', type: 'hiring_spike', title: '2 offres operations officer', detectedAt: daysAgo(5), confidenceScore: 0.7, sourceName: 'Emploi.ci' },
  { id: '3', type: 'expansion_plan', title: 'Expansion régionale annoncée', detectedAt: daysAgo(7), confidenceScore: 0.6, url: 'https://example.com/article' },
  { id: '4', type: 'hiring_spike', title: 'Recrutement support technique', detectedAt: daysAgo(14), confidenceScore: 0.6, sourceName: 'LinkedIn' },
]

const weakSignals: RawSignal[] = [
  { id: 'w1', type: 'digital_activity_spike', detectedAt: daysAgo(80), confidenceScore: 0.15 },
]

const noSignals: RawSignal[] = []

// ── determinePrimaryTrigger ──

console.log('\n── determinePrimaryTrigger ──')

const primary = determinePrimaryTrigger(hiringSignals)
assert(primary !== null, 'Non-null for hiring signals')
assert(primary!.signal.type === 'hiring_spike' || primary!.signal.type === 'expansion_plan', 'Picks high-value signal')
assert(primary!.score > 0, 'Positive score')

assert(determinePrimaryTrigger(noSignals) === null, 'Null for empty signals')

const weakPrimary = determinePrimaryTrigger(weakSignals)
assert(weakPrimary !== null, 'Non-null for weak signal')
assert(weakPrimary!.score < 5, 'Low score for old weak signal')

// ── generateBusinessHypothesis ──

console.log('\n── generateBusinessHypothesis ──')

const hyp1 = generateBusinessHypothesis('hiring_spike', 'BTP', 4, true)
assert(hyp1.length > 30, 'Hypothesis is substantial')
assert(hyp1.includes('recrute') || hyp1.includes('montée'), 'Contains hiring-related terms')
assert(hyp1.includes('convergence') || hyp1.includes('BTP'), 'References convergence or sector')

const hyp2 = generateBusinessHypothesis('tender_detected', null, 1, false)
assert(hyp2.length > 20, 'Hypothesis without sector works')
assert(!hyp2.includes('convergence'), 'No convergence mention for single signal')

// ── buildOpportunityReason ──

console.log('\n── buildOpportunityReason ──')

const reason1 = buildOpportunityReason('hiring_spike', 'Wave Mobile Money', 4)
assert(reason1.includes('Wave Mobile Money'), 'Contains company name')
assert(reason1.includes('Recrutement'), 'Contains business label')
assert(reason1.includes('4 preuves'), 'Mentions evidence count')

const reason2 = buildOpportunityReason('hiring_spike', 'TestCo', 0)
assert(reason2.includes('insuffisantes'), 'Flags insufficient for 0 evidence')

// ── buildEvidenceSummary ──

console.log('\n── buildEvidenceSummary ──')

const evidence = buildEvidenceSummary(hiringSignals)
assert(evidence.length >= 2 && evidence.length <= 5, `Evidence count in range: ${evidence.length}`)
assert(evidence[0].date.length > 0, 'Has date')
assert(evidence[0].label.length > 0, 'Has label')
assert(evidence.some(e => e.shortExcerpt !== null), 'Some have excerpts')

const emptyEvidence = buildEvidenceSummary(noSignals)
assert(emptyEvidence.length === 0, 'Empty for no signals')

// ── assessEvidenceQuality ──

console.log('\n── assessEvidenceQuality ──')

const evidence4 = buildEvidenceSummary(hiringSignals)
const quality1 = assessEvidenceQuality(hiringSignals, evidence4)
assert(quality1 === 'sufficient' || quality1 === 'insufficient', `Good signals = sufficient or insufficient: ${quality1}`)

const weakEvidence = buildEvidenceSummary(weakSignals)
const quality2 = assessEvidenceQuality(weakSignals, weakEvidence)
assert(quality2 === 'weak', 'Weak signals = weak')

assert(assessEvidenceQuality([], []) === 'weak', 'Empty = weak')

// ── determineDisplayStatus ──

console.log('\n── determineDisplayStatus ──')

assert(determineDisplayStatus('Recrutement massif', 'Hypothèse...', 'sufficient', 3) === 'visible', 'Good data = visible')
assert(determineDisplayStatus(null, 'Hypothèse...', 'sufficient', 3) === 'hidden', 'No trigger = hidden')
assert(determineDisplayStatus('Recrutement', null, 'sufficient', 3) === 'hidden', 'No hypothesis = hidden')
assert(determineDisplayStatus('Recrutement', 'Hyp', 'weak', 1) === 'draft', 'Weak + 1 evidence = draft')
assert(determineDisplayStatus('Recrutement', 'Hyp', 'insufficient', 0) === 'hidden', '0 evidence = hidden')

// ── computeTriggerConfidence ──

console.log('\n── computeTriggerConfidence ──')

const conf = computeTriggerConfidence(hiringSignals[0], hiringSignals)
assert(conf > 50, `Good confidence: ${conf}`)
assert(conf <= 100, 'Capped at 100')

// ── computeTriggerData (integration) ──

console.log('\n── computeTriggerData (full) ──')

const full = computeTriggerData(hiringSignals, 'BTP', 'Wave Mobile Money')
assert(full.primaryTriggerLabel.length > 0, 'Has trigger label')
assert(full.businessHypothesis.length > 0, 'Has hypothesis')
assert(full.evidenceCount >= 2, `Evidence count: ${full.evidenceCount}`)
assert(full.evidenceStatus !== 'weak', `Evidence quality: ${full.evidenceStatus}`)
assert(full.displayStatus === 'visible', `Display status: ${full.displayStatus}`)
assert(full.badge.length > 0, 'Has badge')

const emptyFull = computeTriggerData([], 'BTP', 'EmptyCo')
assert(emptyFull.displayStatus === 'hidden', 'Empty signals = hidden')
assert(emptyFull.primaryTriggerLabel === '', 'Empty trigger label')

// ── Summary ──

console.log(`\n═══════════════════════════════`)
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`═══════════════════════════════\n`)
if (failed > 0) process.exit(1)
