/**
 * Exécuter : npx tsx lib/forecast/workflow/__tests__/scoring.run.ts
 */
import assert from 'node:assert/strict'
import { computeMaterialityScore, MATERIALITY_THRESHOLDS } from '../scoring'

function run() {
  const low = computeMaterialityScore({
    sourceTrustTier: 2,
    novelty: 0.05,
    contradiction: 0,
    newKeyEntity: false,
    prevSeverity: 2,
    nextSeverity: 2,
    regionChanged: false,
    sectorChanged: false,
    timelineDeltaDays: null,
    signalConfidence: 0.4,
    duplicatePenalty: 0.8,
    highImpactKeywordHits: 0,
  })
  assert.equal(low.decision, 'suppress')
  assert.ok(low.score < MATERIALITY_THRESHOLDS.suppress + 15)

  const high = computeMaterialityScore({
    sourceTrustTier: 5,
    novelty: 0.9,
    contradiction: 0.8,
    newKeyEntity: true,
    prevSeverity: 2,
    nextSeverity: 5,
    regionChanged: true,
    sectorChanged: true,
    timelineDeltaDays: 45,
    signalConfidence: 0.95,
    duplicatePenalty: 0,
    highImpactKeywordHits: 3,
  })
  assert.equal(high.decision, 'recalculate')
  assert.ok(high.score >= MATERIALITY_THRESHOLDS.reviewBand)

  console.log('intel scoring tests OK', { low: low.score, high: high.score })
}

run()
