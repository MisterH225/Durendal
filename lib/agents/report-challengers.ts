/**
 * report-challengers.ts
 * Pipeline multi-agents : 3 Challengers en parallèle + 1 Synthèse finale.
 *
 * Étape 1 : Le rapport initial (Agent 2) est passé aux 3 Challengers.
 * Étape 2 : Chaque Challenger critique le rapport sur un angle distinct.
 * Étape 3 : L'agent de Synthèse consolide et produit le rapport final enrichi.
 *
 * Chaque Challenger n'intervient qu'UNE SEULE FOIS (pas de boucle).
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export interface ChallengerFeedback {
  agent:     string
  issues:    Array<{ category: string; description: string; severity: 'critical' | 'major' | 'minor'; suggestion: string }>
  score:     number
  summary:   string
}

export interface ChallengerPipelineResult {
  finalReportId:  string | null
  feedbacks:      ChallengerFeedback[]
  skipped:        boolean
  reason?:        string
}

// ── Shared context builder ──────────────────────────────────────────────────

function buildReportContext(report: any): string {
  const c = report.content ?? {}
  const sections: string[] = []

  if (c.executive_summary) sections.push(`SYNTHÈSE EXÉCUTIVE:\n${c.executive_summary}`)

  if (c.company_analyses?.length) {
    sections.push('ANALYSES PAR ENTREPRISE:\n' + c.company_analyses.map((ca: any) =>
      `• ${ca.company}: momentum=${ca.momentum ?? '?'}\n  Position: ${ca.position_summary ?? ''}\n  Mouvements: ${(ca.key_moves ?? []).join('; ')}\n  Forces: ${(ca.strengths ?? []).join('; ')}\n  Risques: ${(ca.weaknesses_or_risks ?? []).join('; ')}`
    ).join('\n'))
  }

  if (c.competitive_comparison) {
    const cc = c.competitive_comparison
    sections.push(`COMPARAISON CONCURRENTIELLE:\n  Vue d'ensemble: ${cc.overview ?? ''}\n  Leader: ${cc.leader ?? ''}\n  Challenger: ${cc.challenger ?? ''}\n  Différenciateurs: ${(cc.differentiators ?? []).map((d: any) => `${d.company}: ${d.advantage}`).join('; ')}\n  Gaps: ${(cc.gaps_to_watch ?? []).join('; ')}`)
  }

  if (c.market_dynamics) {
    const md = c.market_dynamics
    sections.push(`DYNAMIQUES DE MARCHÉ:\n  Tendances: ${(md.trends ?? []).join('; ')}\n  Opportunités: ${(md.emerging_opportunities ?? []).join('; ')}\n  Menaces: ${(md.threats ?? []).join('; ')}`)
  }

  if (c.strategic_alerts?.length) {
    sections.push('ALERTES STRATÉGIQUES:\n' + c.strategic_alerts.map((a: any) =>
      `• [${a.severity}] ${a.alert} — ${a.company} → ${a.recommended_action}`
    ).join('\n'))
  }

  if (c.recommendations?.length) {
    sections.push('RECOMMANDATIONS:\n' + c.recommendations.map((r: any) =>
      `• [${r.priority}] ${r.action} — ${r.rationale} (${r.time_horizon})`
    ).join('\n'))
  }

  if (c.evolution_since_last_report?.company_evolutions?.length) {
    sections.push('ÉVOLUTIONS DEPUIS DERNIER RAPPORT:\n' + c.evolution_since_last_report.company_evolutions.map((e: any) =>
      `• ${e.company}: ${e.previous_momentum} → ${e.current_momentum} (${e.trajectory}) | ${(e.key_changes ?? []).join('; ')}`
    ).join('\n'))
  }

  return sections.join('\n\n')
}

// ── Challenger #1 — Angles morts & faiblesses ──────────────────────────────

async function runChallengerBlindSpots(
  reportContext: string,
  log: (msg: string) => void,
): Promise<ChallengerFeedback> {
  log('[Challenger #1] Analyse des angles morts et faiblesses...')

  const prompt = `Tu es un analyste critique expert en intelligence économique. Ton rôle est d'AUDITER un rapport de veille concurrentielle pour identifier ses FAIBLESSES.

RAPPORT À AUDITER :
${reportContext}

═══ MISSION ═══
Identifie TOUTES les faiblesses de ce rapport :
1. Zones d'ombre : quelles informations manquent cruellement ?
2. Hypothèses non vérifiées : quelles affirmations ne sont pas étayées ?
3. Biais potentiels : le rapport favorise-t-il une interprétation au détriment d'une autre ?
4. Entreprises sous-analysées : certaines entreprises sont-elles insuffisamment couvertes ?
5. Risques ignorés : quels dangers le rapport ne mentionne pas ?

Réponds UNIQUEMENT en JSON valide :
{
  "issues": [
    {
      "category": "angle_mort|hypothese_non_verifiee|biais|sous_analyse|risque_ignore",
      "description": "Description précise du problème",
      "severity": "critical|major|minor",
      "suggestion": "Ce qu'il faudrait ajouter ou corriger"
    }
  ],
  "score": 0-100,
  "summary": "Synthèse en 2-3 phrases des faiblesses principales"
}

RÈGLES :
- Sois EXIGEANT. Un bon rapport doit résister à la critique.
- Identifie au minimum 5 problèmes.
- Ne fais pas de compliments — ton rôle est de trouver les failles.
- Réponds en français.`

  const { text } = await callGemini(prompt, { maxOutputTokens: 3_000, temperature: 0.2 })
  const parsed = parseGeminiJson<any>(text)

  const feedback: ChallengerFeedback = {
    agent: 'blind_spots',
    issues: (parsed?.issues ?? []).map((i: any) => ({
      category: i.category ?? 'angle_mort',
      description: i.description ?? '',
      severity: i.severity ?? 'major',
      suggestion: i.suggestion ?? '',
    })),
    score: parsed?.score ?? 50,
    summary: parsed?.summary ?? '',
  }

  log(`[Challenger #1] ✓ ${feedback.issues.length} problèmes identifiés — score ${feedback.score}/100`)
  return feedback
}

// ── Challenger #2 — Validation par les faits ────────────────────────────────

async function runChallengerFactCheck(
  reportContext: string,
  signalsText: string,
  log: (msg: string) => void,
): Promise<ChallengerFeedback> {
  log('[Challenger #2] Validation factuelle des affirmations...')

  const prompt = `Tu es un vérificateur de faits (fact-checker) expert en veille concurrentielle. Ton rôle est de vérifier que CHAQUE affirmation et prédiction du rapport est soutenue par des preuves tangibles issues des signaux collectés.

RAPPORT À VÉRIFIER :
${reportContext}

SIGNAUX COLLECTÉS (sources de vérité) :
${signalsText}

═══ MISSION ═══
Pour chaque affirmation ou prédiction majeure du rapport :
1. Est-elle directement soutenue par un ou plusieurs signaux ?
2. Les sources citées existent-elles réellement dans les signaux ?
3. Les prédictions sont-elles des extrapolations raisonnables ou des spéculations ?
4. Y a-t-il des affirmations qui contredisent les signaux ?
5. Des données chiffrées ou factuelles manquent-elles pour étayer les conclusions ?

Réponds UNIQUEMENT en JSON valide :
{
  "issues": [
    {
      "category": "affirmation_non_etayee|source_manquante|prediction_speculative|contradiction|donnee_manquante",
      "description": "L'affirmation ou prédiction problématique et pourquoi",
      "severity": "critical|major|minor",
      "suggestion": "Quelles preuves ou données pourraient renforcer cette affirmation"
    }
  ],
  "score": 0-100,
  "summary": "Synthèse du niveau de fiabilité factuelle du rapport"
}

RÈGLES :
- Sois RIGOUREUX. Chaque affirmation doit avoir une base factuelle.
- Distingue clairement les faits vérifiés des extrapolations.
- Identifie au minimum 4 problèmes.
- Réponds en français.`

  const { text } = await callGemini(prompt, { maxOutputTokens: 3_000, temperature: 0.15 })
  const parsed = parseGeminiJson<any>(text)

  const feedback: ChallengerFeedback = {
    agent: 'fact_check',
    issues: (parsed?.issues ?? []).map((i: any) => ({
      category: i.category ?? 'affirmation_non_etayee',
      description: i.description ?? '',
      severity: i.severity ?? 'major',
      suggestion: i.suggestion ?? '',
    })),
    score: parsed?.score ?? 50,
    summary: parsed?.summary ?? '',
  }

  log(`[Challenger #2] ✓ ${feedback.issues.length} problèmes identifiés — score ${feedback.score}/100`)
  return feedback
}

// ── Challenger #3 — Profondeur argumentaire ─────────────────────────────────

async function runChallengerDepth(
  reportContext: string,
  log: (msg: string) => void,
): Promise<ChallengerFeedback> {
  log('[Challenger #3] Évaluation de la profondeur argumentaire...')

  const prompt = `Tu es un expert en stratégie d'entreprise et raisonnement analytique. Ton rôle est d'évaluer la SOLIDITÉ et la PROFONDEUR des raisonnements dans ce rapport de veille concurrentielle.

RAPPORT À ÉVALUER :
${reportContext}

═══ MISSION ═══
Évalue la qualité du raisonnement stratégique :
1. Les prédictions sont-elles suffisamment expliquées (causes, mécanismes, logiques) ?
2. Les recommandations ont-elles une justification stratégique claire ?
3. Les chaînes de causalité sont-elles complètes ou incomplètes ?
4. Les implications de second ordre sont-elles explorées ?
5. Les raisonnements comparatifs entre entreprises sont-ils suffisamment développés ?
6. Les facteurs externes (réglementation, macroéconomie, technologie) sont-ils pris en compte ?

Réponds UNIQUEMENT en JSON valide :
{
  "issues": [
    {
      "category": "prediction_superficielle|recommandation_vague|causalite_incomplete|implication_ignoree|comparaison_faible|facteur_externe_oublie",
      "description": "Le raisonnement problématique et pourquoi il est insuffisant",
      "severity": "critical|major|minor",
      "suggestion": "Quel approfondissement est nécessaire — arguments, logiques, mécanismes à développer"
    }
  ],
  "score": 0-100,
  "summary": "Synthèse de la qualité argumentaire du rapport"
}

RÈGLES :
- Exige des EXPLICATIONS, pas des constats. Chaque prédiction doit avoir un POURQUOI.
- Identifie au minimum 4 problèmes.
- Propose des pistes d'approfondissement concrètes.
- Réponds en français.`

  const { text } = await callGemini(prompt, { maxOutputTokens: 3_000, temperature: 0.2 })
  const parsed = parseGeminiJson<any>(text)

  const feedback: ChallengerFeedback = {
    agent: 'depth',
    issues: (parsed?.issues ?? []).map((i: any) => ({
      category: i.category ?? 'prediction_superficielle',
      description: i.description ?? '',
      severity: i.severity ?? 'major',
      suggestion: i.suggestion ?? '',
    })),
    score: parsed?.score ?? 50,
    summary: parsed?.summary ?? '',
  }

  log(`[Challenger #3] ✓ ${feedback.issues.length} problèmes identifiés — score ${feedback.score}/100`)
  return feedback
}

// ── Agent de Synthèse finale ────────────────────────────────────────────────

async function runSynthesisAgent(
  supabase: any,
  watchId: string,
  watch: any,
  originalReport: any,
  feedbacks: ChallengerFeedback[],
  signalsText: string,
  sourcesIndex: any[],
  log: (msg: string) => void,
): Promise<string | null> {
  log('[Synthèse] Consolidation des retours Challengers et rédaction du rapport final...')

  const reportContext = buildReportContext(originalReport)
  const companiesStr = (watch.watch_companies ?? []).map((wc: any) => wc.companies?.name).filter(Boolean).join(', ')
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  const feedbackText = feedbacks.map(f => {
    const agentLabel = f.agent === 'blind_spots' ? 'Angles morts & faiblesses'
      : f.agent === 'fact_check' ? 'Validation factuelle'
      : 'Profondeur argumentaire'
    const issuesStr = f.issues.map(i =>
      `  [${i.severity.toUpperCase()}] ${i.category}: ${i.description}\n    → Suggestion: ${i.suggestion}`
    ).join('\n')
    return `═══ ${agentLabel} (score: ${f.score}/100) ═══\n${f.summary}\n\nProblèmes identifiés:\n${issuesStr}`
  }).join('\n\n')

  const prompt = `Tu es l'agent de SYNTHÈSE FINALE — un analyste senior en intelligence économique.

Tu as reçu un rapport initial et les CRITIQUES de 3 agents experts. Tu dois maintenant produire le rapport FINAL ENRICHI qui corrige toutes les faiblesses identifiées.

══ RAPPORT INITIAL ══
${reportContext}

══ CRITIQUES DES 3 AGENTS CHALLENGERS ══
${feedbackText}

══ SIGNAUX COLLECTÉS (pour combler les lacunes) ══
${signalsText}

══ CONTEXTE ══
- Entreprises : ${companiesStr}
- Marchés : ${(watch.countries ?? []).join(', ')}
- Secteurs : ${(watch.sectors ?? []).join(', ')}
- Date : ${today}

═══════════════════════════════════════════════════
MISSION : Rédige le rapport FINAL qui :
1. CORRIGE chaque faiblesse identifiée par les Challengers (angles morts, faits non vérifiés, raisonnements superficiels)
2. APPROFONDIT les analyses là où la profondeur argumentaire était insuffisante
3. AJOUTE les données ou arguments manquants en consultant les signaux collectés
4. RENFORCE chaque prédiction avec des mécanismes causaux explicites
5. CONSERVE tout ce qui était bon dans le rapport initial
═══════════════════════════════════════════════════

Réponds UNIQUEMENT en JSON valide :
{
  "title": "Rapport de veille concurrentielle [enrichi] — ${today}",
  "executive_summary": "Synthèse exécutive de 6-10 phrases. Enrichie et consolidée après audit.",
  "company_analyses": [
    {
      "company": "Nom",
      "position_summary": "Position détaillée avec mécanismes explicatifs (3-5 phrases)",
      "key_moves": ["Action stratégique avec citation [N] et explication du POURQUOI"],
      "strengths": ["Force identifiée avec argument factuel"],
      "weaknesses_or_risks": ["Risque identifié avec chaîne de causalité"],
      "momentum": "positive|neutral|negative",
      "momentum_rationale": "Explication en 2-3 phrases de POURQUOI ce momentum",
      "source_refs": [1, 2]
    }
  ],
  "competitive_comparison": {
    "overview": "Analyse comparative approfondie (5-8 phrases avec mécanismes)",
    "leader": "Qui mène, pourquoi, et quels sont les facteurs de maintien",
    "challenger": "Qui monte, avec quels leviers et à quelle vitesse",
    "differentiators": [
      {
        "company": "Entreprise",
        "advantage": "Avantage avec explication du mécanisme concurrentiel",
        "implication": "Impact stratégique détaillé et implications de second ordre"
      }
    ],
    "gaps_to_watch": ["Gap avec explication de pourquoi c'est critique"]
  },
  "market_dynamics": {
    "trends": ["Tendance avec facteurs moteurs et timeline"],
    "emerging_opportunities": ["Opportunité avec conditions de réalisation"],
    "threats": ["Menace avec probabilité et mécanisme d'impact"]
  },
  "strategic_alerts": [
    {
      "severity": "high|medium",
      "alert": "Alerte enrichie avec contexte factuel complet",
      "company": "Entreprise",
      "recommended_action": "Action détaillée avec étapes",
      "evidence": "Preuves factuelles issues des signaux"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "action": "Recommandation détaillée et actionnable",
      "rationale": "Justification stratégique complète avec chaîne causale",
      "time_horizon": "immédiat|court terme|moyen terme",
      "expected_impact": "Impact attendu si exécuté"
    }
  ],
  "challenger_improvements": {
    "blind_spots_addressed": ["Angle mort comblé et comment"],
    "facts_reinforced": ["Affirmation renforcée par de nouvelles preuves"],
    "arguments_deepened": ["Raisonnement approfondi et comment"]
  },
  "period": "${today}",
  "signals_analyzed": "nombre"
}

RÈGLES STRICTES :
- Cite TOUJOURS tes sources avec [N].
- Chaque prédiction doit avoir un MÉCANISME CAUSAL explicite.
- La section challenger_improvements est OBLIGATOIRE pour tracer les améliorations.
- Ne laisse AUCUNE critique des Challengers sans réponse.
- Réponds en français.`

  try {
    const { text, tokensUsed } = await callGemini(prompt, {
      model: 'gemini-2.5-flash',
      maxOutputTokens: 10_000,
      temperature: 0.15,
    })

    log(`[Synthèse] Gemini → ${text.length} chars, ${tokensUsed} tokens`)

    let finalContent = parseGeminiJson<any>(text)
    if (!finalContent) {
      log('[Synthèse] ⚠ Parsing JSON échoué — utilisation du rapport initial')
      return null
    }

    const enrichedCompanyAnalyses = (finalContent.company_analyses ?? []).map((ca: any) => ({
      ...ca,
      sources: (ca.source_refs ?? [])
        .map((ref: number) => sourcesIndex.find((s: any) => s.i === ref))
        .filter(Boolean),
    }))

    const enrichedAlerts = (finalContent.strategic_alerts ?? []).map((a: any) => ({
      ...a,
      sources: (a.source_refs ?? [])
        .map((ref: number) => sourcesIndex.find((s: any) => s.i === ref))
        .filter(Boolean),
    }))

    const content = {
      ...finalContent,
      company_analyses: enrichedCompanyAnalyses,
      strategic_alerts: enrichedAlerts,
      sources_index: sourcesIndex,
      generated_at: new Date().toISOString(),
      is_challenger_enriched: true,
      challenger_scores: {
        blind_spots: feedbacks.find(f => f.agent === 'blind_spots')?.score ?? null,
        fact_check:  feedbacks.find(f => f.agent === 'fact_check')?.score ?? null,
        depth:       feedbacks.find(f => f.agent === 'depth')?.score ?? null,
      },
      challenger_feedbacks: feedbacks,
      previous_report_id: originalReport.id,
      report_sequence: (originalReport.content?.report_sequence ?? 1),
    }

    const { data: report, error: repErr } = await supabase.from('reports').insert({
      watch_id:    watchId,
      account_id:  watch.account_id,
      type:        'synthesis',
      title:       content.title ?? `Rapport enrichi — ${today}`,
      content,
      summary:     typeof content.executive_summary === 'string'
        ? content.executive_summary.slice(0, 2000)
        : `Rapport enrichi — ${today}`,
      agent_used:  2,
      tokens_used: tokensUsed,
    }).select().single()

    if (repErr) {
      log(`[Synthèse] Erreur sauvegarde: ${repErr.message}`)
      return null
    }

    log(`[Synthèse] ✓ Rapport final créé: ${report?.id}`)
    return report?.id ?? null
  } catch (e: any) {
    log(`[Synthèse] ✗ Erreur: ${e?.message ?? e}`)
    return null
  }
}

// ── Pipeline principal ──────────────────────────────────────────────────────

export async function runChallengerPipeline(
  supabase: any,
  watchId:  string,
  watch:    any,
  initialReportId: string,
  log: (msg: string) => void = console.log,
): Promise<ChallengerPipelineResult> {
  log('[Challenger Pipeline] ══ Démarrage de l\'audit multi-agents ══')

  // 1. Charger le rapport initial
  const { data: report, error: repErr } = await supabase
    .from('reports')
    .select('*')
    .eq('id', initialReportId)
    .single()

  if (repErr || !report) {
    log(`[Challenger Pipeline] Rapport initial introuvable: ${repErr?.message}`)
    return { finalReportId: null, feedbacks: [], skipped: true, reason: 'report_not_found' }
  }

  // 2. Charger les signaux pour le fact-checker
  const { data: signals } = await supabase
    .from('signals')
    .select('*, companies(name)')
    .eq('watch_id', watchId)
    .order('relevance_score', { ascending: false })
    .limit(80)

  const signalsList = signals ?? []
  const signalsText = signalsList.map((s: any, i: number) => {
    const src = s.source_name || (s.url ? (() => { try { return new URL(s.url).hostname } catch { return s.url } })() : 'Source inconnue')
    return `[${i + 1}] ${s.companies?.name ?? 'Général'} — ${s.title}\n${s.raw_content?.slice(0, 400) ?? ''}\nSource: ${src}${s.url ? ` (${s.url})` : ''}`
  }).join('\n---\n')

  const sourcesIndex = signalsList
    .map((s: any, i: number) => ({ i: i + 1, url: s.url, title: s.source_name || s.title }))
    .filter((s: any) => s.url)

  const reportContext = buildReportContext(report)

  // 3. Lancer les 3 Challengers en PARALLÈLE
  log('[Challenger Pipeline] Lancement des 3 Challengers en parallèle...')

  const [blindSpots, factCheck, depth] = await Promise.all([
    runChallengerBlindSpots(reportContext, log),
    runChallengerFactCheck(reportContext, signalsText, log),
    runChallengerDepth(reportContext, log),
  ])

  const feedbacks = [blindSpots, factCheck, depth]
  const avgScore = Math.round(feedbacks.reduce((sum, f) => sum + f.score, 0) / feedbacks.length)
  const totalIssues = feedbacks.reduce((sum, f) => sum + f.issues.length, 0)

  log(`[Challenger Pipeline] Audit terminé — ${totalIssues} problèmes, score moyen: ${avgScore}/100`)

  // 4. Agent de Synthèse — produit le rapport final enrichi
  const finalReportId = await runSynthesisAgent(
    supabase, watchId, watch, report, feedbacks, signalsText, sourcesIndex, log,
  )

  if (finalReportId) {
    // Marquer le rapport initial comme brouillon (non visible par défaut)
    await supabase.from('reports').update({
      content: { ...report.content, _is_draft: true, _final_report_id: finalReportId },
    }).eq('id', initialReportId)

    log(`[Challenger Pipeline] ✓ Pipeline terminé — rapport final: ${finalReportId}`)
  } else {
    log('[Challenger Pipeline] ⚠ Synthèse échouée — le rapport initial reste en place')
  }

  return { finalReportId, feedbacks, skipped: false }
}
