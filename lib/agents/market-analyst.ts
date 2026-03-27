/**
 * market-analyst.ts — Agent 3 : Analyse de marché
 *
 * Expert en intelligence économique. Produit une analyse de marché approfondie
 * à partir du rapport concurrentiel (Agent 2) et des signaux collectés.
 *
 * Livrables :
 *  - Cartographie des acteurs et parts de marché estimées
 *  - Tendances structurelles et cycles de marché
 *  - Analyse des barrières à l'entrée
 *  - Matrice attractivité / compétitivité
 *  - Scénarios prospectifs (optimiste / réaliste / pessimiste)
 *  - Données de graphiques (chart_data) exploitables côté frontend
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export interface MarketAnalysisResult {
  reportId:  string | null
  skipped:   boolean
  reason?:   string
}

export async function generateMarketAnalysis(
  supabase:       any,
  watchId:        string,
  watch:          any,
  parentReportId: string,
  log:            (msg: string) => void = console.log,
): Promise<MarketAnalysisResult> {
  log('[Agent 3] ═══ Démarrage Analyse de Marché ═══')

  // ── Charge le rapport Agent 2 ──────────────────────────────────────────
  const { data: parentReport } = await supabase
    .from('reports')
    .select('id, content, title, summary')
    .eq('id', parentReportId)
    .single()

  if (!parentReport) {
    log('[Agent 3] ✗ Rapport parent introuvable')
    return { reportId: null, skipped: true, reason: 'no_parent_report' }
  }

  // ── Charge les signaux de cette veille ──────────────────────────────────
  const { data: signals } = await supabase
    .from('signals')
    .select('title, raw_content, signal_type, relevance_score, source_name, url, companies(name)')
    .eq('watch_id', watchId)
    .order('relevance_score', { ascending: false })
    .limit(60)

  const signalsSummary = (signals ?? []).map((s: any, i: number) =>
    `[${i + 1}] ${s.companies?.name ?? 'Général'} | ${s.signal_type ?? 'news'} | ${s.title}\n${(s.raw_content ?? '').slice(0, 300)}`
  ).join('\n---\n')

  // ── Contexte ────────────────────────────────────────────────────────────
  const companies = (watch.watch_companies ?? [])
    .map((wc: any) => wc.companies?.name).filter(Boolean)
  const countriesStr = (watch.countries ?? []).join(', ')
  const sectorsStr = (watch.sectors ?? []).join(', ')
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const parentContent = JSON.stringify(parentReport.content).slice(0, 8_000)

  // ── Prompt expert ──────────────────────────────────────────────────────
  const prompt = `Tu es un analyste senior en intelligence de marché, spécialisé dans les marchés internationaux et émergents.
Tu travailles avec minutie, précision et un grand sens du détail. Tes analyses font référence dans le secteur.

═══════════════════════════════════════════════════════════
MISSION : Produire une ANALYSE DE MARCHÉ APPROFONDIE
═══════════════════════════════════════════════════════════

CONTEXTE :
- Entreprises surveillées : ${companies.join(', ')} (${companies.length})
- Marchés : ${countriesStr}
- Secteurs : ${sectorsStr}
- Date : ${today}

RAPPORT CONCURRENTIEL (Agent 2) :
${parentContent}

${signals?.length ? `SIGNAUX BRUTS (${signals.length}) :\n${signalsSummary}` : ''}

═══════════════════════════════════════════════════════════
INSTRUCTIONS DÉTAILLÉES :
═══════════════════════════════════════════════════════════

1. CARTOGRAPHIE DU MARCHÉ
   - Identifie tous les acteurs (surveillés + mentionnés dans les signaux).
   - Estime les parts de marché relatives (pas besoin de chiffres exacts — utilise des fourchettes).
   - Classifie chaque acteur : leader / challenger / suiveur / niche.

2. TENDANCES STRUCTURELLES
   - Identifie les grandes tendances (technologiques, réglementaires, consommation).
   - Distingue tendances conjoncturelles vs structurelles.
   - Estime l'impact sur 1 an, 3 ans, 5 ans.

3. BARRIÈRES À L'ENTRÉE & FACTEURS CLÉS DE SUCCÈS
   - Quelles sont les barrières (réglementaires, capitalistiques, technologiques, réseau) ?
   - Quels sont les facteurs clés de succès sur ce marché ?

4. MATRICE ATTRACTIVITÉ / COMPÉTITIVITÉ
   - Pour chaque entreprise surveillée, évalue :
     • Attractivité du segment (croissance, taille, rentabilité) : score 1-10
     • Compétitivité de l'entreprise (forces, position, ressources) : score 1-10

5. SCÉNARIOS PROSPECTIFS (12-18 mois)
   - Scénario optimiste (probabilité + description)
   - Scénario réaliste (probabilité + description)
   - Scénario pessimiste (probabilité + description)

6. DONNÉES GRAPHIQUES
   - Génère des données structurées pour des graphiques :
     • Répartition estimée du marché (pie chart)
     • Matrice attractivité/compétitivité (scatter plot)
     • Évolution des tendances (timeline)

Réponds UNIQUEMENT en JSON valide (pas de markdown) :
{
  "title": "Analyse de marché — ${sectorsStr} — ${today}",
  "executive_summary": "Synthèse en 5-8 phrases de l'état du marché, des dynamiques clés et des perspectives.",
  "market_overview": {
    "market_size_estimate": "Estimation qualitative de la taille du marché",
    "growth_assessment": "Évaluation de la croissance (forte/modérée/faible) avec justification",
    "maturity_stage": "émergent|croissance|mature|déclin",
    "key_figures": ["Chiffre clé 1 extrait des signaux", "Chiffre clé 2"]
  },
  "player_mapping": [
    {
      "company": "Nom",
      "category": "leader|challenger|follower|niche",
      "estimated_market_share": "15-20%",
      "competitive_position": "Description du positionnement concurrentiel",
      "recent_momentum": "positive|neutral|negative"
    }
  ],
  "structural_trends": [
    {
      "trend": "Description de la tendance",
      "type": "structural|cyclical|emerging",
      "impact_level": "high|medium|low",
      "time_horizon": "Description de l'impact dans le temps",
      "affected_players": ["Entreprise 1", "Entreprise 2"]
    }
  ],
  "entry_barriers": {
    "barriers": [
      { "type": "regulatory|capital|technology|network|brand", "description": "...", "severity": "high|medium|low" }
    ],
    "key_success_factors": ["Facteur 1", "Facteur 2", "Facteur 3"]
  },
  "attractiveness_matrix": [
    {
      "company": "Nom",
      "attractiveness_score": 7,
      "competitiveness_score": 8,
      "justification": "Pourquoi ces scores"
    }
  ],
  "scenarios": {
    "optimistic": { "probability": "25%", "description": "Scénario détaillé", "key_drivers": ["Driver 1"] },
    "realistic": { "probability": "55%", "description": "Scénario détaillé", "key_drivers": ["Driver 1"] },
    "pessimistic": { "probability": "20%", "description": "Scénario détaillé", "key_drivers": ["Driver 1"] }
  },
  "chart_data": {
    "market_share_pie": [{ "label": "Entreprise", "value": 20 }],
    "attractiveness_scatter": [{ "label": "Entreprise", "x": 7, "y": 8 }],
    "trend_timeline": [{ "period": "2025", "events": ["Événement"] }]
  },
  "signals_analyzed": ${signals?.length ?? 0}
}

RÈGLES ABSOLUES :
- Base-toi UNIQUEMENT sur les signaux et le rapport fournis. Pas d'invention.
- Sois PRÉCIS et FACTUEL. Cite les sources [N] quand tu fais référence à un signal.
- Les scores de la matrice doivent être JUSTIFIÉS.
- Les scénarios doivent être RÉALISTES et basés sur les tendances observées.
- Les chart_data doivent être COHÉRENTES avec l'analyse.
- Réponds en français.`

  try {
    const { text, tokensUsed } = await callGemini(prompt, {
      model:           'gemini-2.5-flash',
      maxOutputTokens: 8_000,
      temperature:     0.15,
    })

    log(`[Agent 3] Gemini → ${text.length} chars, ${tokensUsed} tokens`)

    let content = parseGeminiJson<any>(text)
    if (!content) {
      log('[Agent 3] ⚠ Parsing JSON échoué — fallback texte brut')
      const cleanText = text.replace(/```(?:json)?\s*\n?/g, '').replace(/```\n?/g, '').trim()
      content = {
        title: `Analyse de marché — ${today}`,
        executive_summary: cleanText.slice(0, 3000),
      }
    }

    content.generated_at = new Date().toISOString()
    content.parent_report_id = parentReportId

    // ── Sauvegarde du rapport Agent 3 ─────────────────────────────────────
    const { data: report, error: repErr } = await supabase.from('reports').insert({
      watch_id:          watchId,
      account_id:        watch.account_id,
      type:              'market',
      title:             content.title ?? `Analyse de marché — ${today}`,
      content,
      summary:           typeof content.executive_summary === 'string'
        ? content.executive_summary.slice(0, 2000)
        : `Analyse de marché — ${today}`,
      charts:            content.chart_data ?? [],
      parent_report_id:  parentReportId,
      agent_used:        3,
      tokens_used:       tokensUsed,
    }).select().single()

    if (repErr) {
      log(`[Agent 3] ✗ Erreur sauvegarde: ${repErr.message}`)
      return { reportId: null, skipped: true, reason: repErr.message }
    }

    // ── Job log Agent 3 ────────────────────────────────────────────────────
    await supabase.from('agent_jobs').insert({
      watch_id:      watchId,
      agent_number:  3,
      status:        'done',
      started_at:    new Date().toISOString(),
      completed_at:  new Date().toISOString(),
      signals_count: signals?.length ?? 0,
      metadata: {
        parent_report_id: parentReportId,
        report_id:        report?.id,
        tokens_used:      tokensUsed,
        has_charts:       !!(content.chart_data),
        players_mapped:   content.player_mapping?.length ?? 0,
        trends_identified: content.structural_trends?.length ?? 0,
      },
    })

    // ── Alerte ──────────────────────────────────────────────────────────────
    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'report_ready',
        title:      'Analyse de marché disponible',
        message:    `"${content.title}" — ${content.player_mapping?.length ?? 0} acteurs cartographiés, ${content.structural_trends?.length ?? 0} tendances identifiées.`,
      })
    }

    log(`[Agent 3] ✓ Rapport créé: ${report?.id} | ${content.player_mapping?.length ?? 0} acteurs | ${content.structural_trends?.length ?? 0} tendances`)
    return { reportId: report?.id ?? null, skipped: false }

  } catch (e: any) {
    log(`[Agent 3] ✗ Erreur: ${e?.message ?? e}`)
    await supabase.from('agent_jobs').insert({
      watch_id: watchId, agent_number: 3, status: 'error',
      started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
      metadata: { error: e?.message },
    })
    return { reportId: null, skipped: true, reason: e?.message }
  }
}
