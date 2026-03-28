/**
 * prediction-engine.ts — Agent 5 : Moteur de Prédiction
 *
 * Analyse prospective en trois axes :
 *  1. Prochain mouvement anticipé par entreprise
 *  2. Intention stratégique déduite
 *  3. Recommandations de contre-positionnement
 *
 * Sources d'alimentation :
 *  - Signaux bruts collectés (Agent 1)
 *  - Rapport concurrentiel (Agent 2)
 *  - Analyse de marché (Agent 3)
 *  - Plan stratégique (Agent 4)
 *
 * Modes :
 *  - MiroFish connecté → simulation multi-agents + enrichissement Gemini
 *  - MiroFish déconnecté → analyse Gemini seule (fallback)
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import {
  type MiroFishConfig,
  checkMiroFishHealth,
  runMiroFishPrediction,
} from '@/lib/modules/mirofish-connector'

export interface PredictionResult {
  reportId: string | null
  skipped:  boolean
  reason?:  string
  usedMiroFish: boolean
}

export async function generatePredictions(
  supabase:          any,
  watchId:           string,
  watch:             any,
  parentReportId:    string,
  marketReportId:    string | null,
  strategyReportId:  string | null,
  log:               (msg: string) => void = console.log,
): Promise<PredictionResult> {
  log('[Agent 5] ═══ Démarrage Moteur de Prédiction ═══')

  // ── Vérifier que le module est actif ────────────────────────────────────
  const { data: agentConfig } = await supabase
    .from('admin_agents')
    .select('status, prompt, model, config')
    .eq('id', 'prediction_engine')
    .single()

  if (!agentConfig || agentConfig.status !== 'active') {
    log('[Agent 5] Module désactivé ou non configuré — skip')
    return { reportId: null, skipped: true, reason: 'agent_disabled', usedMiroFish: false }
  }

  const moduleConfig = (agentConfig.config ?? {}) as Record<string, any>
  const autoTrigger = moduleConfig.auto_trigger !== false

  if (!autoTrigger) {
    log('[Agent 5] Auto-trigger désactivé — skip')
    return { reportId: null, skipped: true, reason: 'auto_trigger_off', usedMiroFish: false }
  }

  // ── Charger les rapports parents ───────────────────────────────────────
  const reportIds = [parentReportId, marketReportId, strategyReportId].filter(Boolean)
  const { data: parentReports } = await supabase
    .from('reports')
    .select('id, type, title, content, summary')
    .in('id', reportIds)

  const reportsMap: Record<string, any> = {}
  for (const r of parentReports ?? []) reportsMap[r.type] = r

  const agent2Report = reportsMap['synthesis'] ?? reportsMap['analyse'] ?? null
  const agent3Report = reportsMap['market'] ?? null
  const agent4Report = reportsMap['strategy'] ?? null

  if (!agent2Report) {
    log('[Agent 5] Aucun rapport Agent 2 trouvé — skip')
    return { reportId: null, skipped: true, reason: 'no_parent_report', usedMiroFish: false }
  }

  // ── Charger les signaux ────────────────────────────────────────────────
  const { data: signals } = await supabase
    .from('signals')
    .select('title, raw_content, signal_type, relevance_score, source_name, companies(name)')
    .eq('watch_id', watchId)
    .order('relevance_score', { ascending: false })
    .limit(50)

  const signalsSummary = (signals ?? []).map((s: any, i: number) =>
    `[${i + 1}] ${s.companies?.name ?? 'Général'} | ${s.signal_type ?? 'news'} | ${s.title}\n${(s.raw_content ?? '').slice(0, 250)}`
  ).join('\n---\n')

  // ── Contexte ───────────────────────────────────────────────────────────
  const companies = (watch.watch_companies ?? [])
    .map((wc: any) => wc.companies?.name).filter(Boolean)
  const countriesStr = (watch.countries ?? []).join(', ')
  const sectorsStr   = (watch.sectors ?? []).join(', ')
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  const agent2Content = JSON.stringify(agent2Report.content).slice(0, 6_000)
  const agent3Content = agent3Report ? JSON.stringify(agent3Report.content).slice(0, 5_000) : ''
  const agent4Content = agent4Report ? JSON.stringify(agent4Report.content).slice(0, 5_000) : ''

  // ── Tenter MiroFish ────────────────────────────────────────────────────
  let usedMiroFish = false
  let miroFishInsights = ''

  const mfConfig: MiroFishConfig = {
    enabled: moduleConfig.mirofish_enabled === true,
    url:     moduleConfig.mirofish_url ?? '',
    apiKey:  moduleConfig.mirofish_api_key ?? '',
  }

  if (mfConfig.enabled && mfConfig.url) {
    const healthy = await checkMiroFishHealth(mfConfig)
    if (healthy) {
      log('[Agent 5] MiroFish connecté — lancement simulation...')
      const seedMaterial = [
        `=== RAPPORT CONCURRENTIEL (Agent 2) ===\n${agent2Content}`,
        agent3Content ? `\n=== ANALYSE DE MARCHÉ (Agent 3) ===\n${agent3Content}` : '',
        agent4Content ? `\n=== PLAN STRATÉGIQUE (Agent 4) ===\n${agent4Content}` : '',
        `\n=== SIGNAUX BRUTS (${signals?.length ?? 0}) ===\n${signalsSummary}`,
      ].join('\n')

      const predictionQuery = `Prédis les prochains mouvements stratégiques des entreprises suivantes : ${companies.join(', ')}. Secteurs : ${sectorsStr}. Marchés : ${countriesStr}.`

      const mfResult = await runMiroFishPrediction(mfConfig, seedMaterial, predictionQuery, log)
      if (mfResult.success && mfResult.report) {
        usedMiroFish = true
        miroFishInsights = mfResult.report.slice(0, 4_000)
        log(`[Agent 5] MiroFish → ${mfResult.report.length} chars en ${mfResult.durationMs}ms`)
      } else {
        log(`[Agent 5] MiroFish échoué (${mfResult.error}) — fallback Gemini`)
      }
    } else {
      log('[Agent 5] MiroFish injoignable — fallback Gemini')
    }
  } else {
    log('[Agent 5] MiroFish non configuré — mode Gemini seul')
  }

  // ── Prompt Gemini (avec ou sans enrichissement MiroFish) ───────────────
  const miroFishBlock = usedMiroFish
    ? `\n═══ INSIGHTS MIROFISH (simulation multi-agents) ═══\n${miroFishInsights}\n\nIntègre ces prédictions issues de la simulation dans ton analyse. Confirme, nuance ou contredis les conclusions de MiroFish selon les données factuelles.\n`
    : ''

  const prompt = `${agentConfig.prompt}

═══════════════════════════════════════════════════════════
DONNÉES D'ENTRÉE
═══════════════════════════════════════════════════════════

CONTEXTE :
- Entreprises surveillées : ${companies.join(', ')} (${companies.length})
- Marchés : ${countriesStr}
- Secteurs : ${sectorsStr}
- Date : ${today}

RAPPORT CONCURRENTIEL (Agent 2) :
${agent2Content}

${agent3Content ? `ANALYSE DE MARCHÉ (Agent 3) :\n${agent3Content}\n` : ''}
${agent4Content ? `PLAN STRATÉGIQUE (Agent 4) :\n${agent4Content}\n` : ''}
${signals?.length ? `SIGNAUX BRUTS (${signals.length}) :\n${signalsSummary}` : ''}
${miroFishBlock}

═══════════════════════════════════════════════════════════
FORMAT DE RÉPONSE (JSON STRICT)
═══════════════════════════════════════════════════════════

{
  "title": "Analyse Prédictive — ${sectorsStr} — ${today}",
  "executive_summary": "Synthèse des prédictions majeures en 5-8 phrases.",
  "predictions_by_company": [
    {
      "company": "Nom de l'entreprise",
      "next_moves": [
        {
          "move": "Description du prochain mouvement anticipé",
          "probability": "75%",
          "timing": "Q2 2025",
          "confidence": "high|medium|low",
          "supporting_signals": ["Signal 1", "Signal 2"],
          "impact_on_market": "Description de l'impact potentiel"
        }
      ],
      "strategic_intention": {
        "primary_objective": "Objectif stratégique principal déduit",
        "strategy_type": "conquest|consolidation|diversification|defense|disruption",
        "alliances_anticipated": ["Partenaire potentiel 1"],
        "conflicts_emerging": ["Conflit identifié"],
        "evidence": ["Preuve 1 issue des signaux"]
      },
      "counter_positioning": [
        {
          "scenario": "Si [entreprise] fait [mouvement]",
          "recommended_action": "Action de contre-positionnement",
          "type": "offensive|defensive|opportunistic",
          "priority": "high|medium|low",
          "urgency": "immediate|short_term|medium_term",
          "expected_outcome": "Résultat attendu"
        }
      ]
    }
  ],
  "market_predictions": {
    "consolidation_probability": "60%",
    "disruption_risks": ["Risque de disruption 1"],
    "emerging_opportunities": ["Opportunité émergente"],
    "key_inflection_points": [
      {
        "event": "Événement charnière anticipé",
        "timing": "Quand",
        "probability": "70%",
        "implications": "Conséquences"
      }
    ]
  },
  "confidence_matrix": {
    "overall_confidence": "medium",
    "data_quality": "high|medium|low",
    "prediction_horizon": "6-12 mois",
    "key_assumptions": ["Hypothèse 1", "Hypothèse 2"],
    "blind_spots": ["Zone aveugle identifiée"]
  },
  "mirofish_used": ${usedMiroFish},
  "signals_analyzed": ${signals?.length ?? 0}
}`

  try {
    const { text, tokensUsed } = await callGemini(prompt, {
      model:           agentConfig.model ?? 'gemini-2.5-flash',
      maxOutputTokens: 10_000,
      temperature:     0.2,
    })

    log(`[Agent 5] Gemini → ${text.length} chars, ${tokensUsed} tokens`)

    let content = parseGeminiJson<any>(text)
    if (!content) {
      log('[Agent 5] Parsing JSON échoué — fallback texte brut')
      const cleanText = text.replace(/```(?:json)?\s*\n?/g, '').replace(/```\n?/g, '').trim()
      content = {
        title: `Analyse prédictive — ${today}`,
        executive_summary: cleanText.slice(0, 3000),
        predictions_by_company: [],
      }
    }

    content.generated_at = new Date().toISOString()
    content.parent_report_id = parentReportId
    content.mirofish_used = usedMiroFish

    // ── Sauvegarde du rapport Agent 5 ─────────────────────────────────────
    const { data: report, error: repErr } = await supabase.from('reports').insert({
      watch_id:         watchId,
      account_id:       watch.account_id,
      type:             'prediction',
      title:            content.title ?? `Analyse prédictive — ${today}`,
      content,
      summary:          typeof content.executive_summary === 'string'
        ? content.executive_summary.slice(0, 2000)
        : `Analyse prédictive — ${today}`,
      parent_report_id: parentReportId,
      agent_used:       5,
      tokens_used:      tokensUsed,
    }).select().single()

    if (repErr) {
      log(`[Agent 5] Erreur sauvegarde: ${repErr.message}`)
      return { reportId: null, skipped: true, reason: repErr.message, usedMiroFish }
    }

    // ── Job log Agent 5 ──────────────────────────────────────────────────
    await supabase.from('agent_jobs').insert({
      watch_id:     watchId,
      agent_number: 5,
      status:       'done',
      started_at:   new Date().toISOString(),
      completed_at: new Date().toISOString(),
      signals_count: signals?.length ?? 0,
      metadata: {
        parent_report_id:   parentReportId,
        market_report_id:   marketReportId,
        strategy_report_id: strategyReportId,
        report_id:          report?.id,
        tokens_used:        tokensUsed,
        mirofish_used:      usedMiroFish,
        companies_predicted: content.predictions_by_company?.length ?? 0,
      },
    })

    // ── Alerte ────────────────────────────────────────────────────────────
    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'report_ready',
        title:      'Analyse prédictive disponible',
        message:    `"${content.title}" — ${content.predictions_by_company?.length ?? 0} entreprises analysées${usedMiroFish ? ' (enrichi par MiroFish)' : ''}.`,
      })
    }

    log(`[Agent 5] Rapport créé: ${report?.id} | ${content.predictions_by_company?.length ?? 0} entreprises | MiroFish: ${usedMiroFish}`)
    return { reportId: report?.id ?? null, skipped: false, usedMiroFish }

  } catch (e: any) {
    log(`[Agent 5] Erreur: ${e?.message ?? e}`)
    await supabase.from('agent_jobs').insert({
      watch_id: watchId, agent_number: 5, status: 'error',
      started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      metadata: { error: e?.message },
    })
    return { reportId: null, skipped: true, reason: e?.message, usedMiroFish: false }
  }
}
