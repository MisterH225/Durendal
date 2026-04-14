import type { TemporalSubtype, RelationCategory, RelationSubtype } from '@/lib/graph/types'
import type { EventCluster } from '../types/event-cluster'
import type { EventRelation } from '../types/event-relation'
import type { AnchorContext } from './hybrid-retrieval'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import {
  runCounterfactualChecks,
  mapCounterfactualToRelation,
} from './counterfactual-check'

export const ANCHOR_CLUSTER_ID = '__anchor__'

function dateDiffDays(dateA: string, dateB: string): number {
  return Math.round(
    (new Date(dateB).getTime() - new Date(dateA).getTime()) / 86_400_000,
  )
}

function relationId(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `rel-${Date.now().toString(36)}-${rand}`
}

// ═══════════════════════════════════════════════════════════════════════════
// 7a. Temporal Linking — deterministic, zero LLM cost
// ═══════════════════════════════════════════════════════════════════════════

export function buildTemporalRelations(
  clusters: EventCluster[],
  anchor: AnchorContext,
): EventRelation[] {
  const anchorDate = anchor.date ?? new Date().toISOString().slice(0, 10)
  const relations: EventRelation[] = []

  for (const cluster of clusters) {
    if (!cluster.eventDate) {
      relations.push({
        id: relationId(),
        sourceClusterId: cluster.clusterId,
        targetClusterId: ANCHOR_CLUSTER_ID,
        temporalRelation: 'concurrent_with',
        semanticCategory: 'temporal',
        semanticSubtype: 'concurrent_with',
        confidence: 0.3,
        mechanismEvidence: '',
        wasDowngraded: false,
        explanation: `${cluster.canonicalTitle} — date inconnue, positionné comme concurrent`,
      })
      continue
    }

    const diff = dateDiffDays(cluster.eventDate, anchorDate)

    let temporalRelation: TemporalSubtype
    let confidence: number

    if (diff > 365) {
      temporalRelation = 'long_term_precursor'
      confidence = cluster.eventDateConfidence === 'high' ? 0.85 : 0.5
    } else if (diff > 3) {
      temporalRelation = 'before'
      confidence = cluster.eventDateConfidence === 'high' ? 0.9 : 0.65
    } else if (diff > 0) {
      temporalRelation = 'immediate_precursor'
      confidence = cluster.eventDateConfidence === 'high' ? 0.95 : 0.7
    } else if (diff === 0) {
      temporalRelation = 'concurrent_with'
      confidence = 0.8
    } else {
      temporalRelation = 'after'
      confidence = cluster.eventDateConfidence === 'high' ? 0.9 : 0.65
    }

    relations.push({
      id: relationId(),
      sourceClusterId: cluster.clusterId,
      targetClusterId: ANCHOR_CLUSTER_ID,
      temporalRelation,
      semanticCategory: 'temporal',
      semanticSubtype: temporalRelation,
      confidence,
      mechanismEvidence: '',
      wasDowngraded: false,
      explanation: `${cluster.canonicalTitle} — ${Math.abs(diff)} jour(s) ${diff > 0 ? 'avant' : diff < 0 ? 'après' : 'le même jour que'} l'ancre`,
    })
  }

  return relations
}

// ═══════════════════════════════════════════════════════════════════════════
// 7b. Causal Candidate Detection — focused LLM call
// ═══════════════════════════════════════════════════════════════════════════

interface CausalDetectionItem {
  clusterId: string
  subtype: string
  confidence: number
  mechanism: string
  explanation: string
}

interface CausalDetectionResult {
  relations: CausalDetectionItem[]
}

function buildCausalDetectionPrompt(
  precursorClusters: EventCluster[],
  anchor: AnchorContext,
): string {
  const clusterList = precursorClusters
    .map(c => [
      `[${c.clusterId}] "${c.canonicalTitle}"`,
      `  Date: ${c.eventDate ?? 'unknown'}`,
      `  Summary: ${c.summary.slice(0, 200)}`,
      `  Entities: ${c.entities.slice(0, 4).join(', ')}`,
    ].join('\n'))
    .join('\n\n')

  return [
    `You are a causal reasoning analyst. Your ONLY job: determine if each candidate event CAUSED or CONTRIBUTED TO the anchor event.`,
    ``,
    `## Anchor event`,
    `Title: "${anchor.title}"`,
    anchor.summary ? `Summary: ${anchor.summary.slice(0, 300)}` : '',
    anchor.date ? `Date: ${anchor.date}` : '',
    anchor.entities?.length ? `Entities: ${anchor.entities.join(', ')}` : '',
    ``,
    `## Candidate precursor events`,
    clusterList,
    ``,
    `## RULES`,
    `1. "Happened before" does NOT mean "caused". You MUST identify a concrete MECHANISM.`,
    `2. A mechanism is: event A changed conditions/created pressure/removed constraint → event B happened`,
    `3. If no mechanism exists, the candidate is NOT causal — skip it entirely.`,
    `4. Background context (treaties, historical events) without direct mechanism = NOT causal`,
    ``,
    `## For each GENUINELY CAUSAL candidate, return:`,
    `- clusterId: the cluster ID`,
    `- subtype: "causes" | "contributes_to" | "enables" | "triggers" | "prevents"`,
    `  - "triggers": immediate, direct action-reaction (e.g., bombing → retaliation)`,
    `  - "causes": strong mechanism, would not have happened without this`,
    `  - "contributes_to": partial cause, one factor among several`,
    `  - "enables": removed a barrier or created conditions`,
    `  - "prevents": blocked or delayed the anchor event`,
    `- confidence: 0.0-1.0`,
    `- mechanism: 1-2 sentences explaining the SPECIFIC mechanism (X → Y because Z)`,
    `- explanation: brief role in the storyline`,
    ``,
    `IMPORTANT: Only include candidates with a real causal mechanism. It is FINE to return an empty array.`,
    ``,
    `Return ONLY valid JSON:`,
    `{"relations": [{"clusterId":"...","subtype":"causes","confidence":0.8,"mechanism":"...","explanation":"..."}]}`,
  ].filter(Boolean).join('\n')
}

export async function detectCausalRelations(
  clusters: EventCluster[],
  temporalRelations: EventRelation[],
  anchor: AnchorContext,
): Promise<EventRelation[]> {
  const precursorIds = new Set(
    temporalRelations
      .filter(r =>
        r.temporalRelation === 'before' ||
        r.temporalRelation === 'immediate_precursor' ||
        r.temporalRelation === 'long_term_precursor',
      )
      .map(r => r.sourceClusterId),
  )

  const precursorClusters = clusters.filter(c => precursorIds.has(c.clusterId))
  if (precursorClusters.length === 0) return []

  try {
    const prompt = buildCausalDetectionPrompt(precursorClusters, anchor)
    const { text } = await callGemini(prompt, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 4000,
      temperature: 0.1,
    })

    const parsed = parseGeminiJson<CausalDetectionResult>(text)
    if (!parsed?.relations || !Array.isArray(parsed.relations)) return []

    const validSubtypes = new Set(['causes', 'contributes_to', 'enables', 'triggers', 'prevents'])
    const clusterIdSet = new Set(clusters.map(c => c.clusterId))

    return parsed.relations
      .filter(r => r.clusterId && clusterIdSet.has(r.clusterId) && validSubtypes.has(r.subtype))
      .map(r => {
        const temporal = temporalRelations.find(
          tr => tr.sourceClusterId === r.clusterId,
        )
        return {
          id: relationId(),
          sourceClusterId: r.clusterId,
          targetClusterId: ANCHOR_CLUSTER_ID,
          temporalRelation: temporal?.temporalRelation ?? ('before' as TemporalSubtype),
          semanticCategory: 'causal' as RelationCategory,
          semanticSubtype: r.subtype as RelationSubtype,
          confidence: Math.max(0, Math.min(1, r.confidence)),
          mechanismEvidence: r.mechanism ?? '',
          wasDowngraded: false,
          explanation: r.explanation ?? '',
        }
      })
  } catch (err) {
    console.error('[relation-detector] Causal detection failed:', err)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7c. Corollary / Response / Spillover Detection — focused LLM call
// ═══════════════════════════════════════════════════════════════════════════

interface CorollaryDetectionItem {
  clusterId: string
  subtype: string
  confidence: number
  explanation: string
  attachedToClusterId?: string
}

interface CorollaryDetectionResult {
  relations: CorollaryDetectionItem[]
}

function buildCorollaryDetectionPrompt(
  candidates: EventCluster[],
  trunkClusterIds: string[],
  allClusters: EventCluster[],
  anchor: AnchorContext,
): string {
  const candidateList = candidates
    .map(c => [
      `[${c.clusterId}] "${c.canonicalTitle}"`,
      `  Date: ${c.eventDate ?? 'unknown'}`,
      `  Summary: ${c.summary.slice(0, 200)}`,
      `  Entities: ${c.entities.slice(0, 4).join(', ')}`,
    ].join('\n'))
    .join('\n\n')

  const trunkList = allClusters
    .filter(c => trunkClusterIds.includes(c.clusterId))
    .map(c => `[${c.clusterId}] "${c.canonicalTitle}" (${c.eventDate ?? '?'})`)
    .join('\n')

  return [
    `You are analyzing SIDE EFFECTS, REACTIONS, and SPILLOVERS related to an anchor event and its causal chain.`,
    ``,
    `## Anchor event`,
    `Title: "${anchor.title}"`,
    anchor.date ? `Date: ${anchor.date}` : '',
    ``,
    `## Main causal chain (trunk events)`,
    trunkList || '(no trunk events identified yet)',
    ``,
    `## Candidate corollary events`,
    candidateList,
    ``,
    `## For each candidate, determine its relationship:`,
    `- "response_to": institutional/political reaction to an event`,
    `- "spillover_from": indirect consequence in a different domain/region`,
    `- "retaliation_to": retaliatory action`,
    `- "market_reaction_to": financial/economic market response`,
    `- "policy_reaction_to": policy or regulatory response`,
    `- "parallel_development": concurrent related development, not a direct effect`,
    `- "unrelated": not related enough to include`,
    ``,
    `For each RELATED candidate, also specify which trunk event or anchor it is most attached to (attachedToClusterId).`,
    ``,
    `Return ONLY valid JSON:`,
    `{"relations": [{"clusterId":"...","subtype":"spillover_from","confidence":0.7,"explanation":"...","attachedToClusterId":"..."}]}`,
  ].filter(Boolean).join('\n')
}

export async function detectCorollaryRelations(
  clusters: EventCluster[],
  temporalRelations: EventRelation[],
  causalRelations: EventRelation[],
  anchor: AnchorContext,
): Promise<EventRelation[]> {
  const causalClusterIds = new Set(causalRelations.map(r => r.sourceClusterId))

  const candidateIds = new Set(
    temporalRelations
      .filter(r =>
        r.temporalRelation === 'after' ||
        r.temporalRelation === 'concurrent_with',
      )
      .map(r => r.sourceClusterId),
  )

  // Also include precursors that were NOT identified as causal — they might be corollary
  for (const r of temporalRelations) {
    if (
      (r.temporalRelation === 'before' || r.temporalRelation === 'immediate_precursor') &&
      !causalClusterIds.has(r.sourceClusterId)
    ) {
      candidateIds.add(r.sourceClusterId)
    }
  }

  const candidateClusters = clusters.filter(c => candidateIds.has(c.clusterId))
  if (candidateClusters.length === 0) return []

  const trunkClusterIds = [
    ...Array.from(causalClusterIds),
    ANCHOR_CLUSTER_ID,
  ]

  try {
    const prompt = buildCorollaryDetectionPrompt(
      candidateClusters,
      trunkClusterIds,
      clusters,
      anchor,
    )
    const { text } = await callGemini(prompt, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 3000,
      temperature: 0.1,
    })

    const parsed = parseGeminiJson<CorollaryDetectionResult>(text)
    if (!parsed?.relations || !Array.isArray(parsed.relations)) return []

    const validSubtypes = new Set([
      'response_to', 'spillover_from', 'retaliation_to',
      'market_reaction_to', 'policy_reaction_to', 'parallel_development',
    ])
    const clusterIdSet = new Set(clusters.map(c => c.clusterId))

    return parsed.relations
      .filter(r => r.clusterId && clusterIdSet.has(r.clusterId) && validSubtypes.has(r.subtype))
      .map(r => {
        const targetId = r.attachedToClusterId && (clusterIdSet.has(r.attachedToClusterId) || r.attachedToClusterId === ANCHOR_CLUSTER_ID)
          ? r.attachedToClusterId
          : ANCHOR_CLUSTER_ID

        const temporal = temporalRelations.find(tr => tr.sourceClusterId === r.clusterId)

        return {
          id: relationId(),
          sourceClusterId: targetId,
          targetClusterId: r.clusterId,
          temporalRelation: temporal?.temporalRelation ?? ('after' as TemporalSubtype),
          semanticCategory: 'corollary' as RelationCategory,
          semanticSubtype: r.subtype as RelationSubtype,
          confidence: Math.max(0, Math.min(1, r.confidence)),
          mechanismEvidence: '',
          wasDowngraded: false,
          explanation: r.explanation ?? '',
        }
      })
  } catch (err) {
    console.error('[relation-detector] Corollary detection failed:', err)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Counterfactual Check Integration
// ═══════════════════════════════════════════════════════════════════════════

export function applyCounterfactualChecks(
  relations: EventRelation[],
  clusters: EventCluster[],
  anchor: AnchorContext,
): EventRelation[] {
  const causalRelations = relations.filter(r => r.semanticCategory === 'causal')
  const nonCausalRelations = relations.filter(r => r.semanticCategory !== 'causal')

  if (causalRelations.length === 0) return relations

  const clusterMap = new Map(clusters.map(c => [c.clusterId, c]))

  const entries = causalRelations.map(rel => {
    const cluster = clusterMap.get(rel.sourceClusterId)
    return {
      candidateTitle: cluster?.canonicalTitle ?? '',
      candidateSummary: cluster?.summary ?? '',
      candidateDate: cluster?.eventDate ?? undefined,
      candidateEntities: cluster?.entities ?? [],
      candidateRegions: cluster?.regionTags ?? [],
      candidateSectors: cluster?.sectorTags ?? [],
      temporalRelation: rel.temporalRelation,
      llmRelationCategory: 'causal' as const,
      llmRelationSubtype: String(rel.semanticSubtype),
      llmCausalConfidence: rel.confidence,
      llmCausalEvidence: rel.mechanismEvidence,
      llmExplanation: rel.explanation,
    }
  })

  const cfResults = runCounterfactualChecks(
    {
      title: anchor.title,
      summary: anchor.summary ?? '',
      date: anchor.date ?? new Date().toISOString().slice(0, 10),
      entities: anchor.entities ?? [],
    },
    entries,
  )

  const verifiedCausal: EventRelation[] = causalRelations.map((rel, i) => {
    const cfResult = cfResults[i]
    const mapped = mapCounterfactualToRelation(cfResult.finalLabel)

    return {
      ...rel,
      semanticCategory: mapped.category as RelationCategory,
      semanticSubtype: mapped.subtype as RelationSubtype,
      confidence: cfResult.confidence,
      counterfactualScore: cfResult.scores.composite,
      wasDowngraded: cfResult.wasDowngraded,
      originalLlmLabel: `causal/${rel.semanticSubtype}`,
      explanation: cfResult.wasDowngraded
        ? `${rel.explanation} [CF: rétrogradé — ${cfResult.explanation.finalRationale}]`
        : rel.explanation,
    }
  })

  const downgradedCount = verifiedCausal.filter(r => r.wasDowngraded).length
  console.log(`[relation-detector] CF check: ${causalRelations.length} causal → ${downgradedCount} downgraded`)

  return [...nonCausalRelations, ...verifiedCausal]
}
