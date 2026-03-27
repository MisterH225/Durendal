/**
 * strategy-advisor.ts — Agent 4 : Stratégie de pénétration de marché
 *
 * Expert en stratégie d'entreprise et pénétration de marché.
 * Produit des recommandations stratégiques actionnables à partir du rapport
 * concurrentiel (Agent 2) et de l'analyse de marché (Agent 3).
 *
 * Livrables :
 *  - Plan stratégique structuré avec priorités
 *  - Matrice SWOT consolidée
 *  - Feuille de route d'actions avec timeline
 *  - Analyse risques / opportunités chiffrée
 *  - Recommandations de partenariats et alliances
 *  - Données de graphiques (chart_data) exploitables côté frontend
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export interface StrategyResult {
  reportId:  string | null
  skipped:   boolean
  reason?:   string
}

export async function generateStrategyReport(
  supabase:        any,
  watchId:         string,
  watch:           any,
  parentReportId:  string,
  marketReportId:  string | null,
  log:             (msg: string) => void = console.log,
): Promise<StrategyResult> {
  log('[Agent 4] ═══ Démarrage Analyse Stratégique ═══')

  // ── Charge le rapport Agent 2 (concurrentiel) ───────────────────────────
  const { data: parentReport } = await supabase
    .from('reports').select('content').eq('id', parentReportId).single()

  if (!parentReport) {
    log('[Agent 4] ✗ Rapport concurrentiel introuvable')
    return { reportId: null, skipped: true, reason: 'no_parent_report' }
  }

  // ── Charge le rapport Agent 3 (marché) si disponible ────────────────────
  let marketContent = ''
  if (marketReportId) {
    const { data: mr } = await supabase
      .from('reports').select('content').eq('id', marketReportId).single()
    if (mr) marketContent = JSON.stringify(mr.content).slice(0, 8_000)
  }

  // ── Charge les signaux les plus pertinents ──────────────────────────────
  const { data: signals } = await supabase
    .from('signals')
    .select('title, raw_content, signal_type, relevance_score, source_name, companies(name)')
    .eq('watch_id', watchId)
    .order('relevance_score', { ascending: false })
    .limit(40)

  const signalsSummary = (signals ?? []).map((s: any, i: number) =>
    `[${i + 1}] ${s.companies?.name ?? 'Général'} | ${s.title}\n${(s.raw_content ?? '').slice(0, 250)}`
  ).join('\n---\n')

  // ── Contexte ────────────────────────────────────────────────────────────
  const companies = (watch.watch_companies ?? [])
    .map((wc: any) => wc.companies?.name).filter(Boolean)
  const countriesStr = (watch.countries ?? []).join(', ')
  const sectorsStr = (watch.sectors ?? []).join(', ')
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const parentContent = JSON.stringify(parentReport.content).slice(0, 8_000)

  // ── Prompt expert stratégie ─────────────────────────────────────────────
  const prompt = `Tu es un consultant senior en stratégie d'entreprise, expert en pénétration de marchés émergents africains.
Tu travailles avec une minutie exceptionnelle. Tes recommandations sont précises, chiffrées quand possible, et immédiatement actionnables.
Tu as un grand sens du détail et tu produis des documents de niveau cabinet de conseil international (McKinsey, BCG).

═══════════════════════════════════════════════════════════
MISSION : Produire un PLAN STRATÉGIQUE COMPLET et ACTIONNABLE
═══════════════════════════════════════════════════════════

CONTEXTE :
- Entreprises surveillées : ${companies.join(', ')} (${companies.length})
- Marchés : ${countriesStr}
- Secteurs : ${sectorsStr}
- Date : ${today}

RAPPORT CONCURRENTIEL (Agent 2) :
${parentContent}

${marketContent ? `ANALYSE DE MARCHÉ (Agent 3) :\n${marketContent}` : ''}

${signals?.length ? `TOP SIGNAUX (${signals.length}) :\n${signalsSummary}` : ''}

═══════════════════════════════════════════════════════════
INSTRUCTIONS — PRODUIS UN DOCUMENT DE NIVEAU CABINET :
═══════════════════════════════════════════════════════════

1. SYNTHÈSE STRATÉGIQUE
   - Résumé exécutif de 8-12 phrases, niveau C-suite.
   - Les 3 enjeux stratégiques majeurs identifiés.

2. MATRICE SWOT CONSOLIDÉE
   - Pour CHAQUE entreprise surveillée ET pour le marché global.
   - Forces, faiblesses internes / opportunités, menaces externes.
   - Chaque point doit citer un signal source [N].

3. RECOMMANDATIONS STRATÉGIQUES
   - 5 à 10 recommandations classées par priorité.
   - Chacune avec : action, justification, risques, budget estimé, timeline.
   - Distingue : quick wins (0-3 mois) / moyen terme (3-12 mois) / long terme (12+ mois).

4. FEUILLE DE ROUTE (ROADMAP)
   - Timeline visuelle des actions sur 12 mois.
   - Jalons clés, dépendances, KPIs de suivi.

5. ANALYSE DE RISQUES
   - Top 5 risques stratégiques avec probabilité et impact.
   - Plan de mitigation pour chaque risque.

6. PARTENARIATS ET ALLIANCES RECOMMANDÉS
   - Quels partenariats stratégiques pourraient être envisagés ?
   - Avec qui ? Pourquoi ? Quel modèle (JV, licence, distribution, etc.) ?

7. DONNÉES GRAPHIQUES
   - SWOT radar (scores par dimension)
   - Roadmap timeline
   - Matrice risques (probabilité vs impact)

Réponds UNIQUEMENT en JSON valide (pas de markdown) :
{
  "title": "Plan stratégique — ${sectorsStr} — ${today}",
  "executive_summary": "Synthèse stratégique de 8-12 phrases de niveau C-suite.",
  "key_strategic_issues": ["Enjeu 1", "Enjeu 2", "Enjeu 3"],
  "swot_analyses": [
    {
      "entity": "Nom (entreprise ou 'Marché global')",
      "strengths": [{ "point": "...", "source_ref": 1 }],
      "weaknesses": [{ "point": "...", "source_ref": 2 }],
      "opportunities": [{ "point": "...", "source_ref": 3 }],
      "threats": [{ "point": "...", "source_ref": 4 }]
    }
  ],
  "strategic_recommendations": [
    {
      "rank": 1,
      "action": "Recommandation actionnable et précise",
      "rationale": "Pourquoi cette action (basé sur les signaux)",
      "priority": "critical|high|medium",
      "category": "growth|defense|efficiency|partnership|innovation",
      "time_horizon": "0-3 mois|3-12 mois|12+ mois",
      "estimated_investment": "Estimation budget (qualitatif : faible/moyen/élevé)",
      "expected_impact": "Impact attendu",
      "risks": ["Risque 1"],
      "kpis": ["KPI de suivi 1"]
    }
  ],
  "roadmap": {
    "phases": [
      {
        "phase": "Phase 1 — Quick Wins (0-3 mois)",
        "actions": [{ "action": "...", "deadline": "...", "owner_type": "direction|marketing|commercial|tech" }],
        "milestone": "Jalon de fin de phase"
      }
    ],
    "dependencies": ["Dépendance 1"]
  },
  "risk_analysis": [
    {
      "risk": "Description du risque",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "Plan de mitigation",
      "risk_score": 8
    }
  ],
  "partnership_recommendations": [
    {
      "partner_type": "Type de partenaire recherché",
      "rationale": "Pourquoi ce partenariat",
      "model": "JV|licence|distribution|tech|franchise",
      "potential_partners": ["Nom potentiel si identifiable dans les signaux"],
      "priority": "high|medium"
    }
  ],
  "chart_data": {
    "swot_radar": [{ "entity": "Entreprise", "strengths": 7, "weaknesses": 4, "opportunities": 8, "threats": 5 }],
    "risk_matrix": [{ "label": "Risque", "probability": 7, "impact": 9 }],
    "roadmap_timeline": [{ "phase": "Phase 1", "start_month": 1, "end_month": 3, "actions_count": 4 }]
  },
  "signals_analyzed": ${signals?.length ?? 0}
}

RÈGLES ABSOLUES :
- NE PAS inventer de faits. Base-toi UNIQUEMENT sur les données fournies.
- Chaque point SWOT doit citer un signal [N] comme source.
- Les recommandations doivent être ACTIONNABLES, pas des généralités.
- Les timelines doivent être RÉALISTES pour des marchés africains.
- Les estimations d'investissement doivent être proportionnées au contexte.
- Réponds en français.`

  try {
    const { text, tokensUsed } = await callGemini(prompt, {
      model:           'gemini-2.5-flash',
      maxOutputTokens: 10_000,
      temperature:     0.15,
    })

    log(`[Agent 4] Gemini → ${text.length} chars, ${tokensUsed} tokens`)

    let content = parseGeminiJson<any>(text)
    if (!content) {
      log('[Agent 4] ⚠ Parsing JSON échoué — fallback texte brut')
      const cleanText = text.replace(/```(?:json)?\s*\n?/g, '').replace(/```\n?/g, '').trim()
      content = {
        title: `Plan stratégique — ${today}`,
        executive_summary: cleanText.slice(0, 3000),
      }
    }

    content.generated_at = new Date().toISOString()
    content.parent_report_id = parentReportId
    content.market_report_id = marketReportId

    // ── Sauvegarde du rapport Agent 4 ─────────────────────────────────────
    const { data: report, error: repErr } = await supabase.from('reports').insert({
      watch_id:          watchId,
      account_id:        watch.account_id,
      type:              'strategy',
      title:             content.title ?? `Plan stratégique — ${today}`,
      content,
      summary:           typeof content.executive_summary === 'string'
        ? content.executive_summary.slice(0, 2000)
        : `Plan stratégique — ${today}`,
      charts:            content.chart_data ?? [],
      parent_report_id:  parentReportId,
      agent_used:        4,
      tokens_used:       tokensUsed,
    }).select().single()

    if (repErr) {
      log(`[Agent 4] ✗ Erreur sauvegarde: ${repErr.message}`)
      return { reportId: null, skipped: true, reason: repErr.message }
    }

    // ── Sauvegarde des recommandations dans la table dédiée ───────────────
    const recos = content.strategic_recommendations ?? []
    if (recos.length > 0 && report?.id) {
      const recoRows = recos.map((r: any) => ({
        watch_id:         watchId,
        account_id:       watch.account_id,
        report_id:        report.id,
        title:            r.action ?? 'Recommandation',
        description:      [r.rationale, r.expected_impact].filter(Boolean).join(' — '),
        priority:         r.priority === 'critical' ? 'high' : (r.priority ?? 'medium'),
        type:             r.category ?? 'growth',
        confidence_score: r.priority === 'critical' ? 0.9 : r.priority === 'high' ? 0.8 : 0.6,
        time_horizon:     r.time_horizon ?? 'moyen terme',
        risks:            r.risks ?? [],
        actions:          r.kpis ?? [],
      }))

      const { error: recoErr } = await supabase.from('recommendations').insert(recoRows)
      if (recoErr) log(`[Agent 4] ⚠ Erreur insert recommandations: ${recoErr.message}`)
      else log(`[Agent 4] ${recoRows.length} recommandations sauvegardées`)
    }

    // ── Job log Agent 4 ────────────────────────────────────────────────────
    await supabase.from('agent_jobs').insert({
      watch_id:      watchId,
      agent_number:  4,
      status:        'done',
      started_at:    new Date().toISOString(),
      completed_at:  new Date().toISOString(),
      signals_count: signals?.length ?? 0,
      metadata: {
        parent_report_id:  parentReportId,
        market_report_id:  marketReportId,
        report_id:         report?.id,
        tokens_used:       tokensUsed,
        recommendations:   recos.length,
        swot_count:        content.swot_analyses?.length ?? 0,
        risks_count:       content.risk_analysis?.length ?? 0,
        has_charts:        !!(content.chart_data),
      },
    })

    // ── Alerte ──────────────────────────────────────────────────────────────
    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'report_ready',
        title:      'Plan stratégique disponible',
        message:    `"${content.title}" — ${recos.length} recommandations, ${content.swot_analyses?.length ?? 0} analyses SWOT, ${content.risk_analysis?.length ?? 0} risques évalués.`,
      })
    }

    log(`[Agent 4] ✓ Rapport créé: ${report?.id} | ${recos.length} recommandations | ${content.swot_analyses?.length ?? 0} SWOT`)
    return { reportId: report?.id ?? null, skipped: false }

  } catch (e: any) {
    log(`[Agent 4] ✗ Erreur: ${e?.message ?? e}`)
    await supabase.from('agent_jobs').insert({
      watch_id: watchId, agent_number: 4, status: 'error',
      started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      metadata: { error: e?.message },
    })
    return { reportId: null, skipped: true, reason: e?.message }
  }
}
