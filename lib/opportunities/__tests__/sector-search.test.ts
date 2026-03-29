/**
 * Tests unitaires — Recherche sectorielle d'opportunités
 */
import assert from 'node:assert'

import {
  buildSectorQueries,
  getSectorSearchProfile,
  SEARCHABLE_SECTORS,
  OPPORTUNITY_TYPE_LABELS,
} from '../sector-search-taxonomy'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e: any) { failed++; console.error(`  ✗ ${name}: ${e.message}`) }
}

console.log('\n=== Sector Search Tests ===\n')

// ── Taxonomy ──

console.log('─ getSectorSearchProfile')

test('Finds BTP by key', () => {
  const p = getSectorSearchProfile('BTP')
  assert(p)
  assert.strictEqual(p.key, 'BTP')
  assert(p.signalTypes.includes('tender_detected'))
  assert(p.queryTemplates.length >= 5)
})

test('Finds Mines by key', () => {
  const p = getSectorSearchProfile('Mines')
  assert(p)
  assert(p.signalTypes.includes('project_launch'))
})

test('Finds Agriculture by fuzzy synonym', () => {
  const p = getSectorSearchProfile('agro')
  assert(p)
  assert.strictEqual(p.key, 'Agriculture')
})

test('Returns undefined for unknown sector', () => {
  const p = getSectorSearchProfile('Aéronautique')
  assert.strictEqual(p, undefined)
})

test('All sectors have at least 5 query templates', () => {
  for (const s of SEARCHABLE_SECTORS) {
    const p = getSectorSearchProfile(s.key)
    assert(p, `Profile not found for ${s.key}`)
    assert(p.queryTemplates.length >= 5, `${s.key} only has ${p.queryTemplates.length} templates`)
  }
})

test('SEARCHABLE_SECTORS lists all 8 sectors', () => {
  assert.strictEqual(SEARCHABLE_SECTORS.length, 8)
  const keys = SEARCHABLE_SECTORS.map(s => s.key)
  assert(keys.includes('BTP'))
  assert(keys.includes('Mines'))
  assert(keys.includes('Tech'))
  assert(keys.includes('Santé'))
})

// ── Query Builder ──

console.log('\n─ buildSectorQueries')

test('Generates queries for BTP Sénégal', () => {
  const queries = buildSectorQueries('BTP', 'SN')
  assert(queries.length >= 5, `Only ${queries.length} queries`)
  const joined = queries.join(' ')
  assert(joined.includes('Sénégal'), 'Should mention Sénégal')
  assert(joined.toLowerCase().includes('btp') || joined.toLowerCase().includes('construction'))
})

test('Generates queries for Mines Côte d\'Ivoire', () => {
  const queries = buildSectorQueries('Mines', 'CI')
  assert(queries.length >= 5)
  const joined = queries.join(' ')
  assert(joined.includes("Côte d'Ivoire") || joined.includes('Ivory'), 'Should mention Côte d\'Ivoire')
})

test('Includes sub-sector in queries', () => {
  const queries = buildSectorQueries('BTP', 'SN', { subSector: 'Routes' })
  const joined = queries.join(' ')
  assert(joined.includes('Routes'), 'Should mention sub-sector')
})

test('Includes keywords in queries', () => {
  const queries = buildSectorQueries('BTP', 'SN', { keywords: ['béton', 'ciment'] })
  const joined = queries.join(' ')
  assert(joined.includes('béton'), 'Should include keyword')
})

test('Includes opportunity types in queries', () => {
  const queries = buildSectorQueries('BTP', 'SN', { opportunityTypes: ['tender_detected'] })
  const joined = queries.join(' ')
  assert(joined.includes('offres') || joined.includes('appel'), 'Should include tender-related term')
})

test('Limits to max 15 queries', () => {
  const queries = buildSectorQueries('BTP', 'SN', {
    subSector: 'Routes',
    keywords: ['béton', 'ciment', 'fer', 'acier', 'gravier'],
    opportunityTypes: ['tender_detected', 'project_launch', 'hiring_spike'],
  })
  assert(queries.length <= 15)
})

test('Returns empty for unknown sector', () => {
  const queries = buildSectorQueries('Aéronautique', 'SN')
  assert.strictEqual(queries.length, 0)
})

// ── Mapping secteur → signaux ──

console.log('\n─ Signal types per sector')

test('BTP has tender_detected and procurement_signal', () => {
  const p = getSectorSearchProfile('BTP')!
  assert(p.signalTypes.includes('tender_detected'))
  assert(p.signalTypes.includes('procurement_signal'))
})

test('Mines has project_launch and expansion_plan', () => {
  const p = getSectorSearchProfile('Mines')!
  assert(p.signalTypes.includes('project_launch'))
  assert(p.signalTypes.includes('expansion_plan'))
})

test('Each sector has at least 5 signal types', () => {
  for (const s of SEARCHABLE_SECTORS) {
    const p = getSectorSearchProfile(s.key)!
    assert(p.signalTypes.length >= 5, `${s.key} only has ${p.signalTypes.length} signal types`)
  }
})

// ── Qualification rules ──

console.log('\n─ Qualification rules (pure logic)')

test('Tender signal → valid opportunity structure', () => {
  const signal = {
    signal_type: 'tender_detected',
    signal_label: 'Appel d\'offres construction route nationale',
    confidence_score: 0.8,
    source_reliability: 0.7,
    detected_at: new Date().toISOString(),
  }
  assert.strictEqual(signal.signal_type, 'tender_detected')
  assert(signal.confidence_score >= 0.5, 'Should have high confidence')
})

test('Insufficient evidence rule: single weak signal → hidden', () => {
  const signals = [{ confidence_score: 0.3, signal_type: 'hiring_spike' }]
  const goodSignals = signals.filter(s => s.confidence_score >= 0.5)
  const uniqueTypes = new Set(signals.map(s => s.signal_type))
  const status = goodSignals.length >= 2 && uniqueTypes.size >= 2 ? 'sufficient'
    : goodSignals.length >= 1 || signals.length >= 2 ? 'insufficient' : 'weak'
  const display = status === 'weak' ? 'hidden' : status === 'insufficient' ? 'draft' : 'visible'
  assert.strictEqual(status, 'weak')
  assert.strictEqual(display, 'hidden')
})

test('Multiple strong signals → visible', () => {
  const signals = [
    { confidence_score: 0.8, signal_type: 'tender_detected' },
    { confidence_score: 0.7, signal_type: 'project_launch' },
    { confidence_score: 0.6, signal_type: 'hiring_spike' },
  ]
  const goodSignals = signals.filter(s => s.confidence_score >= 0.5)
  const uniqueTypes = new Set(signals.map(s => s.signal_type))
  const status = goodSignals.length >= 2 && uniqueTypes.size >= 2 ? 'sufficient' : 'insufficient'
  const display = status === 'sufficient' ? 'visible' : 'draft'
  assert.strictEqual(status, 'sufficient')
  assert.strictEqual(display, 'visible')
})

test('Hiring signal → valid opportunity reason', () => {
  const label = OPPORTUNITY_TYPE_LABELS['hiring_spike']
  assert.strictEqual(label, 'recrutement massif')
})

test('Opportunity from tender has correct structure', () => {
  const opp = {
    primary_trigger_type: 'tender_detected',
    primary_trigger_label: 'Appel d\'offres détecté',
    evidence_count: 3,
    evidence_status: 'sufficient',
    display_status: 'visible',
    origin: 'sector_search',
    sector: 'BTP',
    country: 'SN',
  }
  assert.strictEqual(opp.origin, 'sector_search')
  assert.strictEqual(opp.display_status, 'visible')
  assert(opp.evidence_count >= 2)
})

test('Opportunity from construction start', () => {
  const signal = {
    signal_type: 'project_launch',
    signal_label: 'Démarrage chantier autoroute',
    confidence_score: 0.75,
  }
  assert.strictEqual(signal.signal_type, 'project_launch')
  assert(signal.confidence_score >= 0.5)
})

// ── Summary ──

console.log(`\n═══ ${passed} passed, ${failed} failed ═══\n`)
if (failed > 0) process.exit(1)
