import { callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import type {
  CandidateItem,
  StorylineAnalysis,
  StorylineAnalysisEntry,
  StorylineOutcome,
  TemporalPosition,
  TemporalSubtype,
} from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'

const VALID_POSITIONS: TemporalPosition[] = ['deep_past', 'past', 'recent', 'concurrent', 'consequence', 'future']

const VALID_TEMPORAL_SUBTYPES: TemporalSubtype[] = [
  'before', 'after', 'concurrent_with', 'immediate_precursor', 'long_term_precursor',
]

const VALID_RELATION_CATEGORIES = ['causal', 'contextual', 'corollary'] as const

const VALID_SUBTYPES_BY_CATEGORY: Record<string, string[]> = {
  causal: ['causes', 'contributes_to', 'enables', 'triggers', 'prevents'],
  contextual: ['background_context', 'related_to', 'same_storyline'],
  corollary: ['response_to', 'spillover_from', 'retaliation_to', 'market_reaction_to', 'policy_reaction_to', 'parallel_development'],
}

export async function analyzeStoryline(
  anchor: AnchorContext,
  candidates: CandidateItem[],
): Promise<StorylineAnalysis> {
  const candidateList = candidates
    .slice(0, 35)
    .map((c, i) => `[${i}] "${c.title}" (${c.date ?? 'no date'}) — ${c.summary?.slice(0, 150) ?? ''}`)
    .join('\n')

  const systemInstruction = [
    'You are a senior intelligence analyst specialized in geopolitical, economic, and strategic analysis.',
    'You build structured storylines that explain how situations evolved over time.',
    'You STRICTLY distinguish between temporal ordering and actual causality.',
    '"Happened before" does NOT mean "caused". Most past events are background context, not causes.',
    'You assign causal links ONLY when you can identify a concrete mechanism (action->response, policy->effect, decision->consequence).',
    'You propose realistic outcome scenarios with calibrated probabilities.',
  ].join(' ')

  const prompt = [
    `## Anchor event/article`,
    `Title: "${anchor.title}"`,
    anchor.summary ? `Summary: ${anchor.summary.slice(0, 300)}` : '',
    anchor.date ? `Date: ${anchor.date}` : '',
    ``,
    `## Candidate events/articles`,
    candidateList,
    ``,
    `## Your task`,
    `Analyze ALL candidates and build a structured storyline around the anchor.`,
    ``,
    `For EACH relevant candidate, provide TWO SEPARATE assessments:`,
    ``,
    `### A. Temporal relation (REQUIRED for every candidate)`,
    `- temporalRelation: "before" | "after" | "concurrent_with" | "immediate_precursor" | "long_term_precursor"`,
    `  This is pure chronological ordering. Every past event gets one of these.`,
    ``,
    `### B. Semantic/causal relation (REQUIRED — choose the correct category)`,
    `- relationCategory: "causal" | "contextual" | "corollary"`,
    `- relationSubtype: depends on the category:`,
    `  - if causal: "causes" | "contributes_to" | "enables" | "triggers"`,
    `  - if contextual: "background_context" | "related_to"`,
    `  - if corollary: "response_to" | "spillover_from" | "market_reaction_to" | "policy_reaction_to" | "parallel_development"`,
    `- causalConfidence: 0.0-1.0 (ONLY meaningful for causal relations; set 0 for contextual/corollary)`,
    `- causalEvidence: 1-2 sentences explaining the specific mechanism IF causal. Empty string if not causal.`,
    `- explanation: 1-2 sentences on WHY this is connected`,
    `- entities: key actors involved`,
    ``,
    `## CRITICAL ANTI-CONFLATION RULES`,
    `These rules are absolute. Do not violate them:`,
    `1. "happened before" does NOT mean "caused". MOST past events should be "contextual" > "background_context".`,
    `2. To claim "causal", you MUST identify a specific mechanism: action->response, policy->effect, military strike->retaliation, decision->market move.`,
    `3. If you cannot name the mechanism in causalEvidence, use "contextual" > "background_context" instead.`,
    `4. Older events are usually "contextual" > "background_context" unless there is a DIRECT provable chain.`,
    `5. When in doubt between causal and contextual, ALWAYS choose contextual. False causal claims are worse than missing causal claims.`,
    `6. "related_to" is for topically similar events with no clear causal or contextual relationship.`,
    `7. "corollary" subtypes are for events that are REACTIONS or SIDE-EFFECTS, not causes.`,
    ``,
    `## Outcome scenarios (MANDATORY)`,
    `You MUST generate exactly 3 plausible outcome scenarios for the current situation.`,
    `For EACH outcome:`,
    `- title: concise description of the outcome`,
    `- probability: 0.0-1.0 (probabilities across outcomes should sum to roughly 0.7-1.0)`,
    `- reasoning: 2-3 sentences explaining why this outcome is plausible`,
    `- timeHorizon: "days" | "weeks" | "1-3 months" | "3-12 months"`,
    `- supportingEvidence: list of specific facts/events that support this outcome`,
    `- contradictingEvidence: list of specific facts/events that argue against this outcome`,
    `Even if evidence is weak, STILL generate 3 outcomes with lower probabilities and note uncertainty in reasoning.`,
    ``,
    `## Required JSON output`,
    `Return ONLY valid JSON, no markdown:`,
    `{`,
    `  "anchor": { "title": "...", "summary": "..." },`,
    `  "timeline": [`,
    `    {`,
    `      "candidateRef": "[0] title...",`,
    `      "temporalRelation": "before",`,
    `      "relationCategory": "contextual",`,
    `      "relationSubtype": "background_context",`,
    `      "causalConfidence": 0,`,
    `      "causalEvidence": "",`,
    `      "explanation": "...",`,
    `      "entities": ["..."]`,
    `    }`,
    `  ],`,
    `  "outcomes": [`,
    `    {`,
    `      "title": "...",`,
    `      "probability": 0.4,`,
    `      "reasoning": "...",`,
    `      "timeHorizon": "1-3 months",`,
    `      "supportingEvidence": ["..."],`,
    `      "contradictingEvidence": ["..."]`,
    `    }`,
    `  ],`,
    `  "narrative": "3-5 paragraph chronological narrative in French explaining how the situation evolved. Use DISTINCT language for causes vs context vs timeline. Say 'a causé' only for proven causal links, 'dans le contexte de' for background, 'précédé par' for temporal ordering."`,
    `}`,
  ].filter(Boolean).join('\n')

  try {
    const { text } = await callGeminiWithSearch(prompt, {
      systemInstruction,
      maxOutputTokens: 8000,
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
  _candidates: CandidateItem[],
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

      // Pass through LLM classifications as-is; CounterfactualCheckService
      // handles downgrading weak causal claims during assembly.
      return {
        candidateRef: t.candidateRef,
        temporalRelation,
        relationCategory: relationCategory as 'causal' | 'contextual' | 'corollary',
        relationSubtype,
        causalConfidence,
        causalEvidence: t.causalEvidence ?? '',
        explanation: t.explanation,
        entities: t.entities ?? [],
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

  const timeline: StorylineAnalysisEntry[] = sorted.slice(0, 20).map(c => {
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

    return {
      candidateRef: c.title,
      temporalRelation,
      relationCategory: 'contextual' as const,
      relationSubtype: 'background_context',
      causalConfidence: 0,
      causalEvidence: '',
      explanation: c.summary?.slice(0, 150) ?? 'Événement temporellement proche.',
      entities: c.entities ?? [],
    }
  })

  return {
    anchor: { title: anchor.title, summary: anchor.summary ?? '' },
    timeline,
    outcomes: [],
    narrative: '',
  }
}
