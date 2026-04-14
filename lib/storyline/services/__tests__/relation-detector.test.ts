import { describe, test, expect } from 'vitest'
import { buildTemporalRelations, ANCHOR_CLUSTER_ID } from '../relation-detector'
import type { EventCluster } from '../../types/event-cluster'
import type { AnchorContext } from '../hybrid-retrieval'

function makeCluster(overrides: Partial<EventCluster> = {}): EventCluster {
  return {
    clusterId: 'c-test',
    canonicalTitle: 'Test Event',
    eventDate: '2026-03-01',
    eventDateConfidence: 'high',
    summary: 'A test event',
    entities: ['TestEntity'],
    geography: ['TestRegion'],
    sourceArticles: [],
    clusterSize: 1,
    representativeEventIdx: 0,
    regionTags: [],
    sectorTags: [],
    sourceType: 'internal',
    ...overrides,
  }
}

function makeAnchor(overrides: Partial<AnchorContext> = {}): AnchorContext {
  return {
    title: 'Anchor Event',
    summary: 'The central event',
    keywords: ['anchor'],
    entities: ['AnchorEntity'],
    date: '2026-04-10',
    ...overrides,
  }
}

describe('buildTemporalRelations', () => {
  test('events 2 days before anchor → immediate_precursor', () => {
    const clusters = [makeCluster({ clusterId: 'c1', eventDate: '2026-04-08' })]
    const anchor = makeAnchor()
    const relations = buildTemporalRelations(clusters, anchor)

    expect(relations).toHaveLength(1)
    expect(relations[0].temporalRelation).toBe('immediate_precursor')
    expect(relations[0].semanticCategory).toBe('temporal')
    expect(relations[0].targetClusterId).toBe(ANCHOR_CLUSTER_ID)
  })

  test('events 45 days before anchor → before', () => {
    const clusters = [makeCluster({ clusterId: 'c1', eventDate: '2026-02-24' })]
    const anchor = makeAnchor()
    const relations = buildTemporalRelations(clusters, anchor)

    expect(relations).toHaveLength(1)
    expect(relations[0].temporalRelation).toBe('before')
  })

  test('events 400 days before anchor → long_term_precursor', () => {
    const clusters = [makeCluster({ clusterId: 'c1', eventDate: '2025-02-05' })]
    const anchor = makeAnchor()
    const relations = buildTemporalRelations(clusters, anchor)

    expect(relations).toHaveLength(1)
    expect(relations[0].temporalRelation).toBe('long_term_precursor')
  })

  test('same-day events → concurrent_with', () => {
    const clusters = [makeCluster({ clusterId: 'c1', eventDate: '2026-04-10' })]
    const anchor = makeAnchor()
    const relations = buildTemporalRelations(clusters, anchor)

    expect(relations).toHaveLength(1)
    expect(relations[0].temporalRelation).toBe('concurrent_with')
  })

  test('events after anchor → after', () => {
    const clusters = [makeCluster({ clusterId: 'c1', eventDate: '2026-04-15' })]
    const anchor = makeAnchor()
    const relations = buildTemporalRelations(clusters, anchor)

    expect(relations).toHaveLength(1)
    expect(relations[0].temporalRelation).toBe('after')
  })

  test('events without date → concurrent_with with low confidence', () => {
    const clusters = [makeCluster({ clusterId: 'c1', eventDate: null })]
    const anchor = makeAnchor()
    const relations = buildTemporalRelations(clusters, anchor)

    expect(relations).toHaveLength(1)
    expect(relations[0].temporalRelation).toBe('concurrent_with')
    expect(relations[0].confidence).toBeLessThanOrEqual(0.3)
  })

  test('high confidence date → higher relation confidence', () => {
    const high = makeCluster({ clusterId: 'c1', eventDate: '2026-04-08', eventDateConfidence: 'high' })
    const low = makeCluster({ clusterId: 'c2', eventDate: '2026-04-07', eventDateConfidence: 'low' })
    const anchor = makeAnchor()

    const relations = buildTemporalRelations([high, low], anchor)
    expect(relations).toHaveLength(2)

    const relHigh = relations.find(r => r.sourceClusterId === 'c1')!
    const relLow = relations.find(r => r.sourceClusterId === 'c2')!
    expect(relHigh.confidence).toBeGreaterThan(relLow.confidence)
  })

  test('multiple clusters produce one relation each', () => {
    const clusters = [
      makeCluster({ clusterId: 'c1', eventDate: '2026-01-01' }),
      makeCluster({ clusterId: 'c2', eventDate: '2026-03-15' }),
      makeCluster({ clusterId: 'c3', eventDate: '2026-04-09' }),
      makeCluster({ clusterId: 'c4', eventDate: '2026-04-10' }),
      makeCluster({ clusterId: 'c5', eventDate: '2026-04-12' }),
    ]
    const anchor = makeAnchor()
    const relations = buildTemporalRelations(clusters, anchor)

    expect(relations).toHaveLength(5)

    const byId = new Map(relations.map(r => [r.sourceClusterId, r]))
    expect(byId.get('c1')!.temporalRelation).toBe('before')
    expect(byId.get('c2')!.temporalRelation).toBe('before')
    expect(byId.get('c3')!.temporalRelation).toBe('immediate_precursor')
    expect(byId.get('c4')!.temporalRelation).toBe('concurrent_with')
    expect(byId.get('c5')!.temporalRelation).toBe('after')
  })

  test('all relations have wasDowngraded = false', () => {
    const clusters = [
      makeCluster({ clusterId: 'c1', eventDate: '2026-04-01' }),
      makeCluster({ clusterId: 'c2', eventDate: '2026-04-12' }),
    ]
    const relations = buildTemporalRelations(clusters, makeAnchor())
    for (const r of relations) {
      expect(r.wasDowngraded).toBe(false)
      expect(r.semanticCategory).toBe('temporal')
    }
  })
})
