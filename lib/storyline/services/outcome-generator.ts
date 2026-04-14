import { callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import type { EventCluster } from '../types/event-cluster'
import type { EventRelation } from '../types/event-relation'
import type { OutcomePrediction, ConfidenceLevel } from '../types/outcome-prediction'
import type { AnchorContext } from './hybrid-retrieval'

const TARGET_OUTCOMES = 3
const MIN_OUTCOMES = 2

export interface OutcomeGenerationContext {
  anchor: AnchorContext
  clusters: EventCluster[]
  relations: EventRelation[]
}

interface RawOutcome {
  title: string
  probability: number
  reasoning: string
  timeHorizon: string
  supportingEvidence: string[]
  contradictingEvidence: string[]
  drivenByClusterIds?: string[]
}

interface OutcomeGeneratorResult {
  outcomes: RawOutcome[]
}

export async function generateOutcomes(
  context: OutcomeGenerationContext,
): Promise<OutcomePrediction[]> {
  const { anchor, clusters, relations } = context

  const causalRelations = relations.filter(r => r.semanticCategory === 'causal')
  const corollaryRelations = relations.filter(r => r.semanticCategory === 'corollary')

  const clusterMap = new Map(clusters.map(c => [c.clusterId, c]))

  const causalSummary = causalRelations
    .slice(0, 8)
    .map(r => {
      const cluster = clusterMap.get(r.sourceClusterId)
      return cluster
        ? `- [${r.sourceClusterId}] "${cluster.canonicalTitle}" (${cluster.eventDate ?? '?'}) — ${r.semanticSubtype}: ${r.mechanismEvidence.slice(0, 100)}`
        : null
    })
    .filter(Boolean)
    .join('\n')

  const corollarySummary = corollaryRelations
    .slice(0, 5)
    .map(r => {
      const cluster = clusterMap.get(r.targetClusterId)
      return cluster
        ? `- "${cluster.canonicalTitle}" (${r.semanticSubtype})`
        : null
    })
    .filter(Boolean)
    .join('\n')

  const clusterIds = clusters.map(c => c.clusterId).join(', ')

  const systemInstruction = [
    'You are a senior geopolitical and economic forecasting analyst.',
    'You generate realistic, specific, mutually distinct outcome scenarios based on available evidence.',
    'Your probabilities are calibrated: lower when evidence is weak, higher when strong.',
    'You always consider contradicting evidence.',
    'You avoid generic or vague outcomes like "tensions continue" or "situation evolves".',
  ].join(' ')

  const prompt = [
    `## Current situation`,
    `Anchor: "${anchor.title}"`,
    anchor.summary ? `Summary: ${anchor.summary.slice(0, 400)}` : '',
    anchor.date ? `Date: ${anchor.date}` : '',
    ``,
    causalSummary ? `## Causal drivers (verified)\n${causalSummary}` : '',
    corollarySummary ? `## Corollary / side effects\n${corollarySummary}` : '',
    ``,
    `## Your task`,
    `Generate exactly ${TARGET_OUTCOMES} plausible, SPECIFIC outcome scenarios for the NEAR FUTURE of this situation.`,
    ``,
    `REQUIREMENTS:`,
    `1. Each outcome must be SPECIFIC and ACTIONABLE, not generic.`,
    `   BAD: "tensions increase" — GOOD: "Iran ferme le détroit d'Ormuz pendant 72h, Brent dépasse 120$/baril"`,
    `2. Probabilities across all outcomes should sum to 0.7-1.0`,
    `3. Each outcome must cite at least 1 specific supporting evidence from the causal drivers above`,
    `4. Include at least one escalation scenario and one de-escalation/stabilization scenario`,
    `5. Outcomes should be MUTUALLY DISTINCT — not variations of the same thing`,
    `6. If you reference a causal driver cluster, include its clusterId in drivenByClusterIds`,
    ``,
    `## Available cluster IDs for reference`,
    clusterIds,
    ``,
    `## Required JSON output`,
    `Return ONLY valid JSON, no markdown:`,
    `{`,
    `  "outcomes": [`,
    `    {`,
    `      "title": "Specific outcome description (max 100 chars)",`,
    `      "probability": 0.35,`,
    `      "reasoning": "2-3 sentences citing specific evidence",`,
    `      "timeHorizon": "weeks",`,
    `      "supportingEvidence": ["specific fact from causal chain"],`,
    `      "contradictingEvidence": ["counter-evidence"],`,
    `      "drivenByClusterIds": ["cluster-id-1"]`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Time horizon options: "days" | "weeks" | "1-3 months" | "3-12 months"`,
  ].filter(Boolean).join('\n')

  try {
    const { text } = await callGeminiWithSearch(prompt, {
      systemInstruction,
      maxOutputTokens: 4000,
    })

    const parsed = parseGeminiJson<OutcomeGeneratorResult>(text)
    if (!parsed?.outcomes || parsed.outcomes.length === 0) {
      console.warn('[outcome-generator] LLM returned no outcomes, using fallback')
      return buildFallbackOutcomes(context)
    }

    return sanitizeOutcomes(parsed.outcomes, clusters)
  } catch (err) {
    console.error('[outcome-generator] Gemini call failed:', err)
    return buildFallbackOutcomes(context)
  }
}

function inferConfidence(outcome: RawOutcome): ConfidenceLevel {
  if (
    outcome.supportingEvidence.length >= 2 &&
    outcome.reasoning.length > 80 &&
    outcome.probability >= 0.15
  ) {
    return 'high'
  }
  if (outcome.supportingEvidence.length >= 1 && outcome.reasoning.length > 40) {
    return 'medium'
  }
  return 'low'
}

function sanitizeOutcomes(
  raw: RawOutcome[],
  clusters: EventCluster[],
): OutcomePrediction[] {
  const clusterIds = new Set(clusters.map(c => c.clusterId))

  const outcomes: OutcomePrediction[] = raw
    .filter(o => o.title && o.probability != null)
    .map((o, i) => ({
      id: `outcome-${Date.now().toString(36)}-${i}`,
      title: o.title.slice(0, 120),
      probability: Math.max(0.05, Math.min(0.95, o.probability)),
      probabilitySource: 'ai_estimate' as const,
      confidenceLevel: inferConfidence(o),
      reasoning: o.reasoning ?? '',
      timeHorizon: validateHorizon(o.timeHorizon),
      supportingEvidence: o.supportingEvidence ?? [],
      contradictingEvidence: o.contradictingEvidence ?? [],
      status: 'open' as const,
      drivenByClusterIds: (o.drivenByClusterIds ?? []).filter(id => clusterIds.has(id)),
      raisedByRelationIds: [],
      loweredByRelationIds: [],
    }))

  while (outcomes.length < MIN_OUTCOMES) {
    outcomes.push({
      id: `outcome-fallback-${outcomes.length}`,
      title: `Scénario alternatif ${outcomes.length + 1}`,
      probability: 0.15,
      probabilitySource: 'ai_estimate',
      confidenceLevel: 'low',
      reasoning: 'Scénario généré par défaut en raison de données insuffisantes.',
      timeHorizon: 'weeks',
      supportingEvidence: [],
      contradictingEvidence: [],
      status: 'open',
      drivenByClusterIds: [],
      raisedByRelationIds: [],
      loweredByRelationIds: [],
    })
  }

  return outcomes.slice(0, TARGET_OUTCOMES)
}

function validateHorizon(h: string): OutcomePrediction['timeHorizon'] {
  const valid = new Set(['days', 'weeks', '1-3 months', '3-12 months'])
  return valid.has(h) ? h as OutcomePrediction['timeHorizon'] : 'weeks'
}

function buildFallbackOutcomes(
  context: OutcomeGenerationContext,
): OutcomePrediction[] {
  const topic = context.anchor.title
  return [
    {
      id: 'outcome-fallback-0',
      title: `Escalade ou intensification autour de "${topic.slice(0, 60)}"`,
      probability: 0.30,
      probabilitySource: 'ai_estimate',
      confidenceLevel: 'low',
      reasoning: `Basé sur la dynamique actuelle, une escalade reste plausible. Confiance faible.`,
      timeHorizon: 'weeks',
      supportingEvidence: [],
      contradictingEvidence: [],
      status: 'open',
      drivenByClusterIds: [],
      raisedByRelationIds: [],
      loweredByRelationIds: [],
    },
    {
      id: 'outcome-fallback-1',
      title: `Stabilisation ou statu quo de "${topic.slice(0, 60)}"`,
      probability: 0.40,
      probabilitySource: 'ai_estimate',
      confidenceLevel: 'low',
      reasoning: `Le statu quo est souvent le scénario le plus probable à court terme.`,
      timeHorizon: '1-3 months',
      supportingEvidence: [],
      contradictingEvidence: [],
      status: 'open',
      drivenByClusterIds: [],
      raisedByRelationIds: [],
      loweredByRelationIds: [],
    },
    {
      id: 'outcome-fallback-2',
      title: `Désescalade ou résolution partielle de "${topic.slice(0, 60)}"`,
      probability: 0.20,
      probabilitySource: 'ai_estimate',
      confidenceLevel: 'low',
      reasoning: `Une résolution partielle est possible mais dépend de pressions extérieures.`,
      timeHorizon: '1-3 months',
      supportingEvidence: [],
      contradictingEvidence: [],
      status: 'open',
      drivenByClusterIds: [],
      raisedByRelationIds: [],
      loweredByRelationIds: [],
    },
  ]
}
