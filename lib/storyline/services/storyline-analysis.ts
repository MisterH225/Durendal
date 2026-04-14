import { callGeminiWithSearch, parseGeminiJson } from '@/lib/ai/gemini'
import type {
  CandidateItem,
  SourceArticle,
  StorylineAnalysis,
  StorylineAnalysisEntry,
  StorylineOutcome,
  TemporalPosition,
  TemporalSubtype,
} from '@/lib/graph/types'
import type { AnchorContext } from './hybrid-retrieval'

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
    `Example chain for "Iran war 2026":`,
    `[0] JCPOA nuclear deal 2015 → [1] US withdrawal from JCPOA 2018 → [2] IAEA report: Iran near bomb → [3] US/Israel begin strikes Feb 2026 → [4] Iran retaliates March 2026 → ANCHOR: Current war situation`,
    ``,
    `Each trunk event MUST specify "chainPredecessorRef" = the candidateRef of the PREVIOUS event in the chain.`,
    `The first event in the chain has chainPredecessorRef = null.`,
    `The last trunk event chains into the anchor.`,
    ``,
    `### STEP 2: Identify corollary events`,
    `Corollary events are SIDE EFFECTS that branch off a specific trunk event:`,
    `- market reactions (oil price spike after a bombing)`,
    `- policy responses (UN resolution after an attack)`,
    `- spillover effects (refugee crisis after a military operation)`,
    `- regional consequences (neighboring country impact)`,
    ``,
    `Each corollary MUST specify "attachedToRef" = the candidateRef of the trunk event it branches from.`,
    `Mark them with "isCorollary": true.`,
    ``,
    `### STEP 3: Provide source articles`,
    `For EACH event (trunk or corollary), provide 1-3 source article links:`,
    `"sourceArticles": [{"title": "Article title", "url": "https://..."}]`,
    `Use the URLs from the candidate list when available. Generate plausible source references when not.`,
    ``,
    `### STEP 4: Generate outcomes`,
    `Generate exactly 3 plausible future outcome scenarios.`,
    ``,
    `## For EACH timeline entry, provide:`,
    `- candidateRef: "[index] title" matching the candidate list`,
    `- temporalRelation: "before" | "after" | "concurrent_with" | "immediate_precursor" | "long_term_precursor"`,
    `- relationCategory: "causal" | "contextual" | "corollary"`,
    `- relationSubtype: the specific subtype`,
    `- causalConfidence: 0.0-1.0`,
    `- causalEvidence: mechanism explanation if causal`,
    `- explanation: 1-2 sentences summary of this event`,
    `- entities: key actors`,
    `- chainPredecessorRef: "[index] title" of the PREVIOUS trunk event, or null if first in chain`,
    `- sourceArticles: [{title, url}] — 1-3 source links`,
    `- isCorollary: true/false`,
    `- attachedToRef: "[index] title" of the trunk event this corollary branches from (only if isCorollary=true)`,
    ``,
    `## ANTI-CONFLATION RULES (still apply)`,
    `1. "happened before" does NOT mean "caused". Background events are contextual, not causal.`,
    `2. To claim "causal", you MUST identify a concrete mechanism.`,
    `3. Corollary events are REACTIONS/SIDE-EFFECTS, not causes.`,
    `4. The trunk chain should contain only the STRONGEST causal links.`,
    ``,
    `## Required JSON output`,
    `Return ONLY valid JSON, no markdown:`,
    `{`,
    `  "anchor": { "title": "...", "summary": "2-3 sentence summary of the central event" },`,
    `  "timeline": [`,
    `    {`,
    `      "candidateRef": "[0] title...",`,
    `      "temporalRelation": "before",`,
    `      "relationCategory": "causal",`,
    `      "relationSubtype": "causes",`,
    `      "causalConfidence": 0.8,`,
    `      "causalEvidence": "action → consequence mechanism",`,
    `      "explanation": "Summary of this event...",`,
    `      "entities": ["Actor1", "Actor2"],`,
    `      "chainPredecessorRef": null,`,
    `      "sourceArticles": [{"title": "Article about this", "url": "https://..."}],`,
    `      "isCorollary": false,`,
    `      "attachedToRef": null`,
    `    }`,
    `  ],`,
    `  "outcomes": [`,
    `    {`,
    `      "title": "Outcome description",`,
    `      "probability": 0.4,`,
    `      "reasoning": "Why this is plausible...",`,
    `      "timeHorizon": "1-3 months",`,
    `      "supportingEvidence": ["fact1", "fact2"],`,
    `      "contradictingEvidence": ["counter-fact1"]`,
    `    }`,
    `  ],`,
    `  "narrative": "3-5 paragraph chronological narrative in French explaining the causal chain."`,
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

      // Sanitize sourceArticles
      const sourceArticles: SourceArticle[] = (t.sourceArticles ?? [])
        .filter((a: SourceArticle) => a.title && a.url)
        .slice(0, 3)

      // If LLM didn't provide sourceArticles, try to match from candidate URL
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
