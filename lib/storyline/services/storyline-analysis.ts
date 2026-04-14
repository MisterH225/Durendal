import { callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import type {
  CandidateItem,
  SourceArticle,
  StorylineAnalysis,
  StorylineAnalysisEntry,
  StorylineOutcome,
  TemporalSubtype,
} from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'
import type { EventCluster } from '../types/event-cluster'

const VALID_TEMPORAL_SUBTYPES: TemporalSubtype[] = [
  'before', 'after', 'concurrent_with', 'immediate_precursor', 'long_term_precursor',
]

const VALID_RELATION_CATEGORIES = ['causal', 'contextual', 'corollary'] as const

const VALID_SUBTYPES_BY_CATEGORY: Record<string, string[]> = {
  causal: ['causes', 'contributes_to', 'enables', 'triggers', 'prevents'],
  contextual: ['background_context', 'related_to', 'same_storyline'],
  corollary: ['response_to', 'spillover_from', 'retaliation_to', 'market_reaction_to', 'policy_reaction_to', 'parallel_development'],
}

// ═══════════════════════════════════════════════════════════════════════════
// V2: Cluster-based analysis
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeStorylineFromClusters(
  anchor: AnchorContext,
  clusters: EventCluster[],
): Promise<StorylineAnalysis> {
  const clusterList = clusters
    .slice(0, 25)
    .map((c, i) => {
      const articleLinks = c.sourceArticles.slice(0, 2).map(a => a.url).join(', ')
      return [
        `[${c.clusterId}] "${c.canonicalTitle}"`,
        `  Date: ${c.eventDate ?? 'unknown'}  (confidence: ${c.eventDateConfidence})`,
        `  Summary: ${c.summary.slice(0, 200)}`,
        `  Entities: ${c.entities.slice(0, 4).join(', ')}`,
        `  Sources: ${c.clusterSize} article(s)${articleLinks ? ` — ${articleLinks}` : ''}`,
      ].join('\n')
    })
    .join('\n\n')

  const systemInstruction = [
    'You are a senior intelligence analyst building a visual causal storyline.',
    'You receive PRE-CLUSTERED EVENTS (not raw articles). Each cluster represents ONE unique event with multiple sources.',
    'Your task: organize these events into a causal chain and identify side effects.',
    'You STRICTLY distinguish temporal ordering from actual causality.',
    'You MUST produce 3 outcome scenarios with probability estimates.',
  ].join(' ')

  const prompt = [
    `## Anchor event (CENTRAL EVENT)`,
    `Title: "${anchor.title}"`,
    anchor.summary ? `Summary: ${anchor.summary.slice(0, 400)}` : '',
    anchor.date ? `Date: ${anchor.date}` : '',
    ``,
    `## Event clusters (pre-deduplicated, each = one unique event)`,
    clusterList,
    ``,
    `## YOUR TASK`,
    ``,
    `### STEP 1: Build the TRUNK (main causal chain)`,
    `Select 5-10 events from the clusters that form a LINEAR CAUSAL CHAIN leading to the anchor.`,
    `Order them CHRONOLOGICALLY. Each trunk event MUST CAUSE or DIRECTLY LEAD TO the next.`,
    ``,
    `IMPORTANT: The chain must tell a coherent STORY. Example for "Blocus du détroit d'Ormuz":`,
    `  1. "Programme nucléaire iranien" (2015) → 2. "Retrait US de l'accord JCPOA" (2018) → `,
    `  3. "Rapport AIEA: Iran proche de la bombe" (2025) → 4. "Bombardements US/Israël sur l'Iran" (fév 2026) →`,
    `  5. "Cessez-le-feu US-Iran" (mars 2026) → 6. "Échec des pourparlers de paix à Islamabad" (avril 2026) → ANCHOR`,
    ``,
    `Each trunk event specifies:`,
    `- "chainPredecessorRef": the clusterId of the PREVIOUS event in the chain (null for first)`,
    `- "isCorollary": false`,
    ``,
    `### STEP 2: Identify COROLLARY events`,
    `Corollary events are SIDE EFFECTS / CONSEQUENCES of specific trunk events:`,
    `- Market reactions: oil price spike, currency move, commodity surge`,
    `- Policy responses: UN resolutions, sanctions, coalition building`,
    `- Spillover effects: refugee crisis, regional destabilization, supply disruption`,
    ``,
    `Each corollary specifies:`,
    `- "isCorollary": true`,
    `- "attachedToRef": the clusterId of the trunk event it branches from`,
    ``,
    `### STEP 3: Source articles`,
    `For each event, select 2-3 source articles from the cluster's existing sources.`,
    `"sourceArticles": [{"title": "...", "url": "https://..."}]`,
    ``,
    `### STEP 4: Generate 3 outcomes`,
    `3 plausible future scenarios. Probabilities must sum to ≤ 1.0.`,
    ``,
    `## ANTI-CONFLATION RULES`,
    `1. "happened before" ≠ "caused". For causal claims you MUST identify a concrete mechanism.`,
    `2. Multiple articles about the same event are already merged into one cluster. Do NOT treat them separately.`,
    `3. If an event is a REACTION to the anchor (not a cause), mark it as corollary.`,
    `4. Historical context without direct mechanism = "contextual", not "causal".`,
    ``,
    `## JSON FORMAT`,
    `Return ONLY valid JSON:`,
    `{`,
    `  "anchor": { "title": "...", "summary": "2-3 sentence summary" },`,
    `  "timeline": [`,
    `    {`,
    `      "candidateRef": "cluster-xxx-yyy",`,
    `      "clusterId": "cluster-xxx-yyy",`,
    `      "temporalRelation": "before",`,
    `      "relationCategory": "causal",`,
    `      "relationSubtype": "causes",`,
    `      "causalConfidence": 0.8,`,
    `      "causalEvidence": "mechanism: X led to Y because...",`,
    `      "explanation": "Summary of this event and its role in the storyline",`,
    `      "entities": ["Actor1"],`,
    `      "chainPredecessorRef": null,`,
    `      "sourceArticles": [{"title": "...", "url": "https://..."}],`,
    `      "isCorollary": false,`,
    `      "attachedToRef": null`,
    `    }`,
    `  ],`,
    `  "outcomes": [`,
    `    {`,
    `      "title": "Outcome",`,
    `      "probability": 0.4,`,
    `      "reasoning": "Why...",`,
    `      "timeHorizon": "1-3 months",`,
    `      "supportingEvidence": ["fact1"],`,
    `      "contradictingEvidence": ["counter1"]`,
    `    }`,
    `  ],`,
    `  "narrative": "3-5 paragraph chronological narrative in French explaining the full causal chain."`,
    `}`,
  ].filter(Boolean).join('\n')

  try {
    const { text } = await callGeminiWithSearch(prompt, {
      systemInstruction,
      maxOutputTokens: 12000,
    })

    const parsed = parseGeminiJson<StorylineAnalysis>(text)
    if (!parsed) {
      console.error('[storyline-analysis-v2] Failed to parse Gemini response')
      return buildFallbackFromClusters(anchor, clusters)
    }

    return sanitizeClusterAnalysis(parsed, clusters)
  } catch (err) {
    console.error('[storyline-analysis-v2] Gemini call failed:', err)
    return buildFallbackFromClusters(anchor, clusters)
  }
}

function sanitizeClusterAnalysis(
  raw: StorylineAnalysis,
  clusters: EventCluster[],
): StorylineAnalysis {
  const clusterIds = new Set(clusters.map(c => c.clusterId))

  const timeline: StorylineAnalysisEntry[] = (raw.timeline ?? [])
    .filter(t => t.candidateRef && t.explanation)
    .map(t => {
      const temporalRelation = VALID_TEMPORAL_SUBTYPES.includes(t.temporalRelation as TemporalSubtype)
        ? t.temporalRelation as TemporalSubtype
        : 'before' as TemporalSubtype

      let relationCategory = t.relationCategory as string
      if (!VALID_RELATION_CATEGORIES.includes(relationCategory as typeof VALID_RELATION_CATEGORIES[number])) {
        relationCategory = 'contextual'
      }

      let relationSubtype = t.relationSubtype
      const validSubs = VALID_SUBTYPES_BY_CATEGORY[relationCategory] ?? []
      if (!validSubs.includes(relationSubtype)) {
        relationSubtype = relationCategory === 'causal' ? 'contributes_to'
          : relationCategory === 'corollary' ? 'parallel_development'
          : 'background_context'
      }

      const causalConfidence = relationCategory === 'causal'
        ? Math.max(0, Math.min(1, t.causalConfidence ?? 0))
        : 0

      const sourceArticles: SourceArticle[] = (t.sourceArticles ?? [])
        .filter((a: SourceArticle) => a.title && a.url)
        .slice(0, 3)

      // If no source articles from LLM, pull from the matched cluster
      if (sourceArticles.length === 0) {
        const ref = t.candidateRef || t.clusterId
        if (ref) {
          const cluster = clusters.find(c => c.clusterId === ref)
          if (cluster) {
            sourceArticles.push(...cluster.sourceArticles.slice(0, 3))
          }
        }
      }

      // Resolve clusterId
      let clusterId = t.clusterId ?? t.candidateRef
      if (!clusterIds.has(clusterId)) {
        const match = clusters.find(c =>
          c.clusterId === t.candidateRef ||
          c.canonicalTitle.toLowerCase().includes(t.candidateRef?.toLowerCase().slice(0, 30) ?? ''),
        )
        clusterId = match?.clusterId ?? clusterId
      }

      return {
        candidateRef: t.candidateRef,
        clusterId,
        temporalRelation,
        relationCategory: relationCategory as 'causal' | 'contextual' | 'corollary',
        relationSubtype,
        causalConfidence,
        causalEvidence: t.causalEvidence ?? '',
        explanation: t.explanation,
        entities: t.entities ?? [],
        chainPredecessorRef: t.chainPredecessorRef ?? undefined,
        sourceArticles,
        isCorollary: t.isCorollary ?? false,
        attachedToRef: t.attachedToRef ?? undefined,
      }
    })

  const outcomes: StorylineOutcome[] = (raw.outcomes ?? [])
    .filter(o => o.title && o.probability != null)
    .map(o => ({
      title: o.title,
      probability: Math.max(0, Math.min(1, o.probability)),
      reasoning: o.reasoning ?? '',
      timeHorizon: o.timeHorizon ?? 'weeks',
      supportingEvidence: o.supportingEvidence ?? [],
      contradictingEvidence: o.contradictingEvidence ?? [],
      probabilitySource: 'ai_estimate' as const,
    }))

  return {
    anchor: raw.anchor ?? { title: '', summary: '' },
    timeline,
    outcomes,
    narrative: raw.narrative ?? '',
  }
}

function buildFallbackFromClusters(
  anchor: AnchorContext,
  clusters: EventCluster[],
): StorylineAnalysis {
  const sorted = [...clusters]
    .filter(c => c.eventDate)
    .sort((a, b) => (a.eventDate ?? '').localeCompare(b.eventDate ?? ''))

  const anchorDate = anchor.date ?? new Date().toISOString().slice(0, 10)

  const timeline: StorylineAnalysisEntry[] = sorted.slice(0, 15).map((c, i) => {
    let temporalRelation: TemporalSubtype = 'concurrent_with'
    if (c.eventDate && c.eventDate < anchorDate) {
      const daysBefore = Math.round(
        (new Date(anchorDate).getTime() - new Date(c.eventDate).getTime()) / 86400000,
      )
      temporalRelation = daysBefore > 365 ? 'long_term_precursor'
        : daysBefore > 7 ? 'before'
        : 'immediate_precursor'
    }
    if (c.eventDate && c.eventDate > anchorDate) temporalRelation = 'after'

    const prev = i > 0 ? sorted[i - 1] : null

    return {
      candidateRef: c.clusterId,
      clusterId: c.clusterId,
      temporalRelation,
      relationCategory: 'contextual' as const,
      relationSubtype: 'background_context',
      causalConfidence: 0,
      causalEvidence: '',
      explanation: c.summary.slice(0, 200),
      entities: c.entities,
      chainPredecessorRef: prev?.clusterId ?? undefined,
      sourceArticles: c.sourceArticles.slice(0, 3),
      isCorollary: false,
    }
  })

  return {
    anchor: { title: anchor.title, summary: anchor.summary ?? '' },
    timeline,
    outcomes: [],
    narrative: '',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// V1: Legacy candidate-based analysis (preserved for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeStoryline(
  anchor: AnchorContext,
  candidates: CandidateItem[],
): Promise<StorylineAnalysis> {
  const candidateList = candidates
    .slice(0, 35)
    .map((c, i) => {
      const urlPart = c.url ? ` [${c.url}]` : ''
      return `[${i}] "${c.title}" (${c.date ?? 'no date'})${urlPart} — ${c.summary?.slice(0, 150) ?? ''}`
    })
    .join('\n')

  const systemInstruction = [
    'You are a senior intelligence analyst who builds visual storylines.',
    'Your output becomes an interactive visual map where the user navigates events as a causal chain.',
    'You MUST build a LINEAR CAUSAL CHAIN: each trunk event leads to the next, forming a clear narrative.',
    'Corollary events (market reactions, spillovers, policy responses) branch OFF specific trunk events.',
    'You STRICTLY distinguish temporal ordering from actual causality.',
    'Each event card needs 2-3 source article links so the user can read more.',
  ].join(' ')

  const prompt = [
    `## Anchor event (CENTRAL EVENT)`,
    `Title: "${anchor.title}"`,
    anchor.summary ? `Summary: ${anchor.summary.slice(0, 400)}` : '',
    anchor.date ? `Date: ${anchor.date}` : '',
    ``,
    `## Candidate events/articles`,
    candidateList,
    ``,
    `## YOUR TASK: Build a LINEAR CAUSAL CHAIN storyline`,
    ``,
    `### STEP 1: Select trunk events (the main storyline)`,
    `From the candidates, select 5-10 KEY events that form a LINEAR CAUSAL CHAIN leading to the anchor.`,
    `These trunk events must be ordered chronologically and each one must CAUSE or DIRECTLY LEAD TO the next.`,
    ``,
    `Each trunk event MUST specify "chainPredecessorRef" = the candidateRef of the PREVIOUS event in the chain.`,
    `The first event in the chain has chainPredecessorRef = null.`,
    `The last trunk event chains into the anchor.`,
    ``,
    `### STEP 2: Identify corollary events`,
    `Corollary events are SIDE EFFECTS that branch off a specific trunk event.`,
    `Each corollary MUST specify "attachedToRef" = the candidateRef of the trunk event it branches from.`,
    `Mark them with "isCorollary": true.`,
    ``,
    `### STEP 3: Provide source articles`,
    `For EACH event, provide 1-3 source article links.`,
    ``,
    `### STEP 4: Generate outcomes`,
    `Generate exactly 3 plausible future outcome scenarios.`,
    ``,
    `## ANTI-CONFLATION RULES`,
    `1. "happened before" does NOT mean "caused". Background events are contextual, not causal.`,
    `2. To claim "causal", you MUST identify a concrete mechanism.`,
    `3. Corollary events are REACTIONS/SIDE-EFFECTS, not causes.`,
    `4. The trunk chain should contain only the STRONGEST causal links.`,
    ``,
    `## JSON FORMAT`,
    `Return ONLY valid JSON:`,
    `{`,
    `  "anchor": { "title": "...", "summary": "..." },`,
    `  "timeline": [{ "candidateRef": "[0] title", "temporalRelation": "before", "relationCategory": "causal", "relationSubtype": "causes", "causalConfidence": 0.8, "causalEvidence": "...", "explanation": "...", "entities": ["..."], "chainPredecessorRef": null, "sourceArticles": [{"title": "...", "url": "..."}], "isCorollary": false, "attachedToRef": null }],`,
    `  "outcomes": [{ "title": "...", "probability": 0.4, "reasoning": "...", "timeHorizon": "1-3 months", "supportingEvidence": ["..."], "contradictingEvidence": ["..."] }],`,
    `  "narrative": "Narrative in French."`,
    `}`,
  ].filter(Boolean).join('\n')

  try {
    const { text } = await callGeminiWithSearch(prompt, {
      systemInstruction,
      maxOutputTokens: 10000,
    })

    const parsed = parseGeminiJson<StorylineAnalysis>(text)
    if (!parsed) {
      console.error('[storyline-analysis] Failed to parse Gemini response')
      return buildFallbackAnalysis(anchor, candidates)
    }

    return sanitizeAnalysis(parsed, candidates)
  } catch (err) {
    console.error('[storyline-analysis] Gemini call failed:', err)
    return buildFallbackAnalysis(anchor, candidates)
  }
}

function sanitizeAnalysis(
  raw: StorylineAnalysis,
  candidates: CandidateItem[],
): StorylineAnalysis {
  const timeline: StorylineAnalysisEntry[] = (raw.timeline ?? [])
    .filter(t => t.candidateRef && t.explanation)
    .map(t => {
      const temporalRelation = VALID_TEMPORAL_SUBTYPES.includes(t.temporalRelation as TemporalSubtype)
        ? t.temporalRelation as TemporalSubtype
        : 'before' as TemporalSubtype

      let relationCategory = t.relationCategory as string
      if (!VALID_RELATION_CATEGORIES.includes(relationCategory as typeof VALID_RELATION_CATEGORIES[number])) {
        relationCategory = 'contextual'
      }

      let relationSubtype = t.relationSubtype
      const validSubs = VALID_SUBTYPES_BY_CATEGORY[relationCategory] ?? []
      if (!validSubs.includes(relationSubtype)) {
        relationSubtype = relationCategory === 'causal' ? 'contributes_to'
          : relationCategory === 'corollary' ? 'parallel_development'
          : 'background_context'
      }

      const causalConfidence = relationCategory === 'causal'
        ? Math.max(0, Math.min(1, t.causalConfidence ?? 0))
        : 0

      const sourceArticles: SourceArticle[] = (t.sourceArticles ?? [])
        .filter((a: SourceArticle) => a.title && a.url)
        .slice(0, 3)

      if (sourceArticles.length === 0) {
        const refIdx = t.candidateRef.match(/^\[(\d+)\]/)
        if (refIdx) {
          const idx = parseInt(refIdx[1], 10)
          const cand = candidates[idx]
          if (cand?.url) {
            sourceArticles.push({ title: cand.title.slice(0, 80), url: cand.url })
          }
        }
      }

      return {
        candidateRef: t.candidateRef,
        temporalRelation,
        relationCategory: relationCategory as 'causal' | 'contextual' | 'corollary',
        relationSubtype,
        causalConfidence,
        causalEvidence: t.causalEvidence ?? '',
        explanation: t.explanation,
        entities: t.entities ?? [],
        chainPredecessorRef: t.chainPredecessorRef ?? undefined,
        sourceArticles,
        isCorollary: t.isCorollary ?? false,
        attachedToRef: t.attachedToRef ?? undefined,
      }
    })

  const outcomes: StorylineOutcome[] = (raw.outcomes ?? [])
    .filter(o => o.title && o.probability != null)
    .map(o => ({
      title: o.title,
      probability: Math.max(0, Math.min(1, o.probability)),
      reasoning: o.reasoning ?? '',
      timeHorizon: o.timeHorizon ?? 'weeks',
      supportingEvidence: o.supportingEvidence ?? [],
      contradictingEvidence: o.contradictingEvidence ?? [],
      probabilitySource: 'ai_estimate' as const,
    }))

  return {
    anchor: raw.anchor ?? { title: '', summary: '' },
    timeline,
    outcomes,
    narrative: raw.narrative ?? '',
  }
}

function buildFallbackAnalysis(
  anchor: AnchorContext,
  candidates: CandidateItem[],
): StorylineAnalysis {
  const sorted = [...candidates]
    .filter(c => c.date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const anchorDate = anchor.date ?? new Date().toISOString().slice(0, 10)

  const timeline: StorylineAnalysisEntry[] = sorted.slice(0, 20).map((c, i) => {
    let temporalRelation: TemporalSubtype = 'concurrent_with'
    if (c.date && c.date < anchorDate) {
      const daysBefore = Math.round(
        (new Date(anchorDate).getTime() - new Date(c.date).getTime()) / 86400000,
      )
      temporalRelation = daysBefore > 365 ? 'long_term_precursor'
        : daysBefore > 7 ? 'before'
        : 'immediate_precursor'
    }
    if (c.date && c.date > anchorDate) temporalRelation = 'after'

    const prev = i > 0 ? sorted[i - 1] : null

    return {
      candidateRef: c.title,
      temporalRelation,
      relationCategory: 'contextual' as const,
      relationSubtype: 'background_context',
      causalConfidence: 0,
      causalEvidence: '',
      explanation: c.summary?.slice(0, 150) ?? 'Événement temporellement proche.',
      entities: c.entities ?? [],
      chainPredecessorRef: prev ? prev.title : undefined,
      sourceArticles: c.url ? [{ title: c.title.slice(0, 80), url: c.url }] : [],
      isCorollary: false,
    }
  })

  return {
    anchor: { title: anchor.title, summary: anchor.summary ?? '' },
    timeline,
    outcomes: [],
    narrative: '',
  }
}
