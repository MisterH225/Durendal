import { CounterfactualCheckService } from '../counterfactual-check'
import type { CounterfactualCheckInput, TemporalSubtype } from '@/lib/graph/types'

function makeInput(overrides: Partial<CounterfactualCheckInput> = {}): CounterfactualCheckInput {
  return {
    anchorTitle: 'Iran bombards US allies in the Gulf',
    anchorSummary: 'Iranian missile strikes hit facilities in Saudi Arabia and UAE following weeks of escalation.',
    anchorDate: '2025-04-10',
    anchorEntities: ['Iran', 'USA', 'Saudi Arabia', 'UAE'],
    candidateTitle: 'US imposes new sanctions on Iranian oil exports',
    candidateSummary: 'The US Treasury Department announced comprehensive sanctions targeting Iranian crude oil exports.',
    candidateDate: '2025-03-28',
    candidateEntities: ['USA', 'Iran'],
    candidateRegions: ['Middle East'],
    candidateSectors: ['Energy', 'Geopolitics'],
    temporalRelation: 'immediate_precursor' as TemporalSubtype,
    llmRelationCategory: 'causal',
    llmRelationSubtype: 'triggers',
    llmCausalConfidence: 0.8,
    llmCausalEvidence: 'US sanctions provoked Iranian retaliation → missile strikes on Gulf allies',
    llmExplanation: 'Direct escalatory response to economic pressure',
    competingCauses: [],
    ...overrides,
  }
}

describe('CounterfactualCheckService', () => {
  const service = new CounterfactualCheckService()

  // ── Test 1: Pure temporal predecessor, not a cause ──────────────────

  test('pure temporal predecessor with no mechanism → preceded_by', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'UN General Assembly opens annual session',
      candidateSummary: 'Annual session begins with routine speeches.',
      candidateEntities: ['UN'],
      llmRelationCategory: 'causal',
      llmRelationSubtype: 'causes',
      llmCausalConfidence: 0.2,
      llmCausalEvidence: '',
      llmExplanation: 'Happened before the anchor event.',
      temporalRelation: 'before',
    }))

    expect(result.wasDowngraded).toBe(true)
    expect(['preceded_by', 'background_context']).toContain(result.finalLabel)
    expect(result.scores.mechanismPlausibility).toBeLessThan(0.3)
  })

  // ── Test 2: Background condition vs direct trigger ─────────────────

  test('historical treaty is background context, not cause', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'Iran nuclear deal (JCPOA) signed in 2015',
      candidateSummary: 'Iran and P5+1 sign nuclear agreement limiting enrichment.',
      candidateDate: '2015-07-14',
      candidateEntities: ['Iran', 'USA', 'EU'],
      temporalRelation: 'long_term_precursor',
      llmRelationCategory: 'causal',
      llmRelationSubtype: 'enables',
      llmCausalConfidence: 0.4,
      llmCausalEvidence: 'The JCPOA collapse set the stage for current tensions.',
      llmExplanation: 'Framework collapse removed diplomatic constraints.',
    }))

    expect(['long_term_precursor', 'background_context', 'contributes_to']).toContain(result.finalLabel)
    expect(result.scores.temporalSupport).toBeLessThan(0.4)
  })

  // ── Test 3: Policy → market reaction chain ─────────────────────────

  test('policy decision causing direct market reaction → triggers or likely_cause', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'US announces 25% tariff on Chinese imports',
      candidateSummary: 'President signs executive order imposing tariffs on $300B of Chinese goods.',
      anchorTitle: 'Global stock markets crash 5% in one day',
      anchorSummary: 'Markets plunge as trade war fears escalate following tariff announcement.',
      anchorDate: '2025-04-02',
      anchorEntities: ['USA', 'China', 'S&P 500'],
      candidateDate: '2025-04-01',
      candidateEntities: ['USA', 'China'],
      temporalRelation: 'immediate_precursor',
      llmRelationCategory: 'causal',
      llmRelationSubtype: 'triggers',
      llmCausalConfidence: 0.9,
      llmCausalEvidence: 'Tariff announcement → market panic → 5% crash. Direct action-reaction chain.',
      llmExplanation: 'Policy decision triggered immediate market reaction.',
    }))

    expect(['triggers', 'likely_cause']).toContain(result.finalLabel)
    expect(result.scores.composite).toBeGreaterThan(0.5)
    expect(result.wasDowngraded).toBe(false)
  })

  // ── Test 4: Retaliatory response → response_to ────────────────────

  test('retaliatory action classified as response_to, not cause', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'Iran retaliates with missile strikes on Saudi oil facilities',
      candidateSummary: 'In response to US sanctions, Iran launches retaliatory strikes.',
      anchorTitle: 'US imposes new sanctions on Iranian oil exports',
      anchorSummary: 'US Treasury announces sweeping oil export sanctions.',
      anchorDate: '2025-03-28',
      anchorEntities: ['USA', 'Iran'],
      candidateDate: '2025-04-10',
      candidateEntities: ['Iran', 'Saudi Arabia'],
      temporalRelation: 'after',
      llmRelationCategory: 'corollary',
      llmRelationSubtype: 'response_to',
      llmCausalConfidence: 0,
      llmCausalEvidence: '',
      llmExplanation: 'Retaliatory response to sanctions pressure.',
    }))

    expect(result.finalLabel).toBe('response_to')
    expect(result.scores.responsePatternScore).toBeGreaterThan(0.5)
  })

  // ── Test 5: Regional spillover → spillover_from ───────────────────

  test('regional aftershock classified as spillover', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'Nigerian naira drops 10% as Gulf oil production halted',
      candidateSummary: 'Spillover from Gulf crisis causes currency pressure in oil-dependent African economies.',
      anchorTitle: 'Iran bombards US allies in the Gulf',
      anchorSummary: 'Iranian strikes disrupt oil production.',
      anchorDate: '2025-04-10',
      anchorEntities: ['Iran', 'Saudi Arabia'],
      candidateDate: '2025-04-12',
      candidateEntities: ['Nigeria'],
      candidateRegions: ['West Africa'],
      temporalRelation: 'after',
      llmRelationCategory: 'corollary',
      llmRelationSubtype: 'spillover_from',
      llmCausalConfidence: 0,
      llmCausalEvidence: '',
      llmExplanation: 'Regional economic contagion from Gulf crisis.',
    }))

    expect(result.finalLabel).toBe('spillover_from')
    expect(result.scores.spilloverPatternScore).toBeGreaterThan(0.4)
  })

  // ── Test 6: Multiple causes — one dominant trigger ────────────────

  test('weaker cause penalized when stronger alternative exists', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'UN condemns Iranian nuclear enrichment',
      candidateSummary: 'UN resolution condemning Iran passed by Security Council.',
      candidateDate: '2025-02-15',
      candidateEntities: ['UN', 'Iran'],
      temporalRelation: 'before',
      llmRelationCategory: 'causal',
      llmRelationSubtype: 'contributes_to',
      llmCausalConfidence: 0.4,
      llmCausalEvidence: 'Added diplomatic pressure but not direct trigger.',
      llmExplanation: 'Part of escalation context.',
      competingCauses: [{
        title: 'US imposes new sanctions on Iranian oil exports',
        entities: ['USA', 'Iran'],
        causalConfidence: 0.85,
        causalEvidence: 'Direct trigger via sanctions → retaliation chain',
        temporalRelation: 'immediate_precursor',
        mechanismPlausibility: 0.8,
      }],
    }))

    expect(result.scores.alternativeCausePenalty).toBeGreaterThan(0.2)
    expect(['contributes_to', 'background_context', 'long_term_precursor']).toContain(result.finalLabel)
  })

  // ── Test 7: Low evidence → downgraded ─────────────────────────────

  test('causal claim with no evidence downgraded', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'Oil prices rise 3%',
      candidateSummary: 'Oil prices increase on supply concerns.',
      candidateDate: '2025-04-05',
      candidateEntities: ['OPEC'],
      temporalRelation: 'before',
      llmRelationCategory: 'causal',
      llmRelationSubtype: 'causes',
      llmCausalConfidence: 0.5,
      llmCausalEvidence: '',
      llmExplanation: 'Oil price movement.',
    }))

    expect(result.wasDowngraded).toBe(true)
    expect(['preceded_by', 'background_context']).toContain(result.finalLabel)
    expect(result.scores.evidenceSupport).toBe(0)
  })

  // ── Test 8: Contradictory evidence lowers confidence ──────────────

  test('candidate with weak entity overlap gets low counterfactual dependence', () => {
    const result = service.evaluate(makeInput({
      candidateTitle: 'EU summit discusses climate policy',
      candidateSummary: 'European leaders agree on new emissions targets.',
      candidateDate: '2025-04-01',
      candidateEntities: ['EU', 'France', 'Germany'],
      candidateRegions: ['Europe'],
      temporalRelation: 'before',
      llmRelationCategory: 'causal',
      llmRelationSubtype: 'contributes_to',
      llmCausalConfidence: 0.3,
      llmCausalEvidence: 'EU climate policy affects energy markets.',
      llmExplanation: 'Energy policy impact.',
    }))

    expect(result.scores.counterfactualDependence).toBeLessThan(0.4)
    expect(result.wasDowngraded).toBe(true)
  })

  // ── Test 9: Explanation output quality ─────────────────────────────

  test('explanation bullets are present and meaningful', () => {
    const result = service.evaluate(makeInput())

    expect(result.explanation.bullets.length).toBeGreaterThan(2)
    expect(result.explanation.finalRationale.length).toBeGreaterThan(20)
    expect(result.explanation.bullets.every(b => typeof b === 'string' && b.length > 5)).toBe(true)
  })

  // ── Test 10: Scores are within [0, 1] bounds ─────────────────────

  test('all scores are bounded between 0 and 1', () => {
    const result = service.evaluate(makeInput())

    expect(result.scores.temporalSupport).toBeGreaterThanOrEqual(0)
    expect(result.scores.temporalSupport).toBeLessThanOrEqual(1)
    expect(result.scores.mechanismPlausibility).toBeGreaterThanOrEqual(0)
    expect(result.scores.mechanismPlausibility).toBeLessThanOrEqual(1)
    expect(result.scores.counterfactualDependence).toBeGreaterThanOrEqual(0)
    expect(result.scores.counterfactualDependence).toBeLessThanOrEqual(1)
    expect(result.scores.evidenceSupport).toBeGreaterThanOrEqual(0)
    expect(result.scores.evidenceSupport).toBeLessThanOrEqual(1)
    expect(result.scores.alternativeCausePenalty).toBeGreaterThanOrEqual(0)
    expect(result.scores.alternativeCausePenalty).toBeLessThanOrEqual(1)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })
})
