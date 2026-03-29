/**
 * report-generator.ts
 * Génération de rapports de veille concurrentielle approfondie.
 *
 * Appelé DIRECTEMENT depuis le scrape route après la collecte.
 * Produit une analyse comparative inter-entreprises, pas un simple résumé.
 */

import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export interface ReportResult {
  reportId:  string | null
  insights:  number
  sources:   number
  skipped:   boolean
  reason?:   string
}

/**
 * Génère un rapport de veille concurrentielle structuré.
 *
 * @param supabase  Client Supabase (admin)
 * @param watchId   ID de la veille
 * @param watch     Objet veille (avec watch_companies, countries, sectors, account_id)
 * @param isInitial Vrai pour un rapport initial (après première collecte)
 */
export async function generateWatchReport(
  supabase:  any,
  watchId:   string,
  watch:     any,
  isInitial  = true,
  log:       (msg: string) => void = console.log,
): Promise<ReportResult> {
  log('[Report] Génération du rapport de veille concurrentielle...')

  // ── Récupère les signaux non traités ─────────────────────────────────────
  const { data: rawSignals, error: sigErr } = await supabase
    .from('signals')
    .select('*, companies(name)')
    .eq('watch_id', watchId)
    .eq('is_processed', false)
    .order('relevance_score', { ascending: false })
    .limit(120)

  if (sigErr) {
    log(`[Report] Erreur récupération signaux: ${sigErr.message}`)
    return { reportId: null, insights: 0, sources: 0, skipped: true, reason: sigErr.message }
  }

  if (!rawSignals || rawSignals.length === 0) {
    log('[Report] Aucun signal à synthétiser — rapport ignoré')
    return { reportId: null, insights: 0, sources: 0, skipped: true, reason: 'no_signals' }
  }

  // ── Filtrer et trier par date de publication ────────────────────────────
  const now       = new Date()
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())

  const signals = rawSignals
    .map((s: any) => {
      const pubDate = s.published_at ? new Date(s.published_at) : null
      const isRecent = !pubDate || pubDate >= twoYearsAgo
      const agePenalty = pubDate
        ? Math.max(0, 1 - ((now.getTime() - pubDate.getTime()) / (365 * 24 * 3600 * 1000)) * 0.3)
        : 0.7
      return { ...s, _pubDate: pubDate, _isRecent: isRecent, _adjustedRelevance: (s.relevance_score ?? 0.5) * agePenalty }
    })
    .filter((s: any) => s._isRecent)
    .sort((a: any, b: any) => b._adjustedRelevance - a._adjustedRelevance)
    .slice(0, 80)

  const excludedCount = rawSignals.length - signals.length
  if (excludedCount > 0) {
    log(`[Report] ${excludedCount} signaux anciens (>2 ans) exclus du rapport`)
  }
  log(`[Report] ${signals.length} signaux à synthétiser (triés par pertinence × récence)`)

  // ── Contexte entreprises ─────────────────────────────────────────────────
  const companies = (watch.watch_companies ?? [])
    .map((wc: any) => wc.companies?.name)
    .filter(Boolean)
  const companiesStr = companies.join(', ')
  const companyCount = companies.length

  // ── Signaux formatés par entreprise ──────────────────────────────────────
  const signalsByCompany = new Map<string, any[]>()
  for (const s of signals) {
    const name = s.companies?.name ?? 'Général'
    if (!signalsByCompany.has(name)) signalsByCompany.set(name, [])
    signalsByCompany.get(name)!.push(s)
  }

  const signalsText = signals.map((s: any, i: number) => {
    const sourceLabel = s.source_name
      || (s.url ? (() => { try { return new URL(s.url).hostname } catch { return s.url } })() : 'Source inconnue')
    const pubLabel = s.published_at
      ? `Date pub. : ${new Date(s.published_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`
      : 'Date pub. : non déterminée'
    return [
      `[${i + 1}] ${s.companies?.name ?? 'Général'} — ${s.title}`,
      pubLabel,
      s.raw_content?.slice(0, 800) ?? '',
      `Source : ${sourceLabel}${s.url ? ` (${s.url})` : ''}`,
    ].join('\n')
  }).join('\n\n---\n\n')

  const sourcesIndex = signals
    .map((s: any, i: number) => ({ i: i + 1, url: s.url, title: s.source_name || s.title }))
    .filter((s: any) => s.url)

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const countriesStr = (watch.countries ?? []).join(', ')
  const sectorsStr = (watch.sectors ?? []).join(', ')

  // ── Charger les rapports précédents (Agent 2) pour cette veille ─────────
  const { data: previousReports } = await supabase
    .from('reports')
    .select('id, title, content, summary, created_at')
    .eq('watch_id', watchId)
    .eq('agent_used', 2)
    .order('created_at', { ascending: false })
    .limit(3)

  const prevReports = previousReports ?? []
  const hasPreviousReports = prevReports.length > 0

  let previousContext = ''
  if (hasPreviousReports) {
    log(`[Report] ${prevReports.length} rapport(s) précédent(s) trouvé(s) — analyse des progressions`)

    previousContext = prevReports.map((r: any, idx: number) => {
      const c = r.content ?? {}
      const date = r.created_at
        ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
        : '?'

      const companySnapshots = (c.company_analyses ?? []).map((ca: any) =>
        `  • ${ca.company}: momentum=${ca.momentum ?? '?'} | Forces: ${(ca.strengths ?? []).slice(0, 2).join('; ')} | Risques: ${(ca.weaknesses_or_risks ?? []).slice(0, 2).join('; ')} | Mouvements: ${(ca.key_moves ?? []).slice(0, 2).join('; ')}`
      ).join('\n')

      const leaderStr = c.competitive_comparison?.leader ?? ''
      const challengerStr = c.competitive_comparison?.challenger ?? ''

      return [
        `══ RAPPORT PRÉCÉDENT ${idx + 1} (${date}) ══`,
        `Titre: ${r.title}`,
        `Synthèse: ${(c.executive_summary ?? r.summary ?? '').slice(0, 600)}`,
        companySnapshots ? `Analyses par entreprise :\n${companySnapshots}` : '',
        leaderStr ? `Leader identifié: ${leaderStr}` : '',
        challengerStr ? `Challenger: ${challengerStr}` : '',
      ].filter(Boolean).join('\n')
    }).join('\n\n')
  } else {
    log('[Report] Aucun rapport précédent — premier rapport pour cette veille')
  }

  // ── Blocs conditionnels du prompt ──────────────────────────────────────
  const previousBlock = hasPreviousReports
    ? `\n═══ RAPPORTS PRÉCÉDENTS (${prevReports.length}) ═══\nAnalyse ces rapports précédents pour identifier les PROGRESSIONS et RÉGRESSIONS de chaque entreprise.\n\n${previousContext}\n═══ FIN DES RAPPORTS PRÉCÉDENTS ═══\n`
    : ''

  const evolutionSchema = hasPreviousReports
    ? `,
  "evolution_since_last_report": {
    "period_comparison": "Du [date précédent rapport] au ${today}",
    "company_evolutions": [
      {
        "company": "Nom",
        "previous_momentum": "positive|neutral|negative (du rapport précédent)",
        "current_momentum": "positive|neutral|negative (maintenant)",
        "trajectory": "improving|stable|declining",
        "key_changes": ["Changement majeur depuis le dernier rapport"],
        "new_developments": ["Nouveau fait absent du rapport précédent"]
      }
    ],
    "market_shifts": ["Changement significatif du paysage concurrentiel depuis le dernier rapport"],
    "leader_change": "Le leadership a-t-il changé ? Si oui, pourquoi ?",
    "emerging_risks_since_last": ["Nouveau risque apparu depuis le dernier rapport"],
    "resolved_issues": ["Problème identifié précédemment qui est maintenant résolu"]
  }`
    : ''

  const evolutionRules = hasPreviousReports
    ? `\n- La section "evolution_since_last_report" est OBLIGATOIRE. Compare systématiquement chaque entreprise avec son état dans le rapport précédent.
- Indique clairement si le momentum a changé (ex: était "neutral", maintenant "positive").
- Identifie les NOUVEAUX faits qui n'existaient pas dans le rapport précédent.
- Si le leader ou le challenger a changé, explique pourquoi.`
    : ''

  // ── Prompt d'analyse concurrentielle profonde ────────────────────────────
  const prompt = `Tu es un analyste senior en intelligence économique et veille concurrentielle.

CONTEXTE DE LA VEILLE :
- Entreprises surveillées : ${companiesStr} (${companyCount} entreprises)
- Marchés : ${countriesStr}
- Secteurs : ${sectorsStr}
- Date : ${today}
- Signaux par entreprise : ${Array.from(signalsByCompany.entries()).map(([name, sigs]) => `${name} (${sigs.length})`).join(', ')}
- Rapports précédents : ${hasPreviousReports ? `${prevReports.length} rapport(s) disponible(s) pour comparaison` : 'Aucun (premier rapport)'}
${previousBlock}
${signals.length} SIGNAUX COLLECTÉS (avec sources vérifiables) :
${signalsText}

═══════════════════════════════════════════════════════════
MISSION : Produis un rapport de veille concurrentielle APPROFONDI.
Ce n'est PAS un simple résumé de signaux. Tu dois ANALYSER, COMPARER et INTERPRÉTER.${hasPreviousReports ? '\nTu dois aussi COMPARER avec les rapports précédents pour mesurer les PROGRESSIONS et RÉGRESSIONS.' : ''}
═══════════════════════════════════════════════════════════

Réponds UNIQUEMENT en JSON valide (pas de markdown autour) :
{
  "title": "Rapport de veille concurrentielle — ${today}",
  "executive_summary": "Synthèse stratégique de 5-8 phrases. Quels sont les mouvements majeurs du marché ? Quelle entreprise se démarque et pourquoi ? Quels risques et opportunités émergent ?${hasPreviousReports ? ' Mentionne les évolutions majeures depuis le dernier rapport.' : ''}",
  "company_analyses": [
    {
      "company": "Nom de l'entreprise",
      "position_summary": "Résumé du positionnement actuel et de la dynamique (2-3 phrases)",
      "key_moves": ["Action stratégique 1 avec citation [N]", "Action 2 [N]"],
      "strengths": ["Force concurrentielle identifiée"],
      "weaknesses_or_risks": ["Faiblesse ou risque identifié"],
      "momentum": "positive|neutral|negative",
      "source_refs": [1, 2, 3]
    }
  ],
  "competitive_comparison": {
    "overview": "Analyse comparative globale : comment les entreprises se positionnent les unes par rapport aux autres (3-5 phrases)",
    "leader": "Qui mène et pourquoi ?",
    "challenger": "Qui monte en puissance ?",
    "differentiators": [
      {
        "company": "Entreprise",
        "advantage": "Ce que cette entreprise fait que les autres ne font pas",
        "implication": "Pourquoi c'est important à surveiller"
      }
    ],
    "gaps_to_watch": ["Ce que l'entreprise X fait mais pas Y — risque pour Y"]
  },
  "market_dynamics": {
    "trends": ["Tendance structurelle du marché identifiée dans les signaux"],
    "emerging_opportunities": ["Opportunité émergente avec explication"],
    "threats": ["Menace concurrentielle ou réglementaire"]
  },
  "strategic_alerts": [
    {
      "severity": "high|medium",
      "alert": "Mouvement critique d'un concurrent à surveiller de très près",
      "company": "Entreprise concernée",
      "recommended_action": "Ce qu'il faudrait faire en réponse"
    }
  ],
  "recommendations": [
    {
      "priority": "high|medium|low",
      "action": "Recommandation actionnable",
      "rationale": "Pourquoi cette action est importante au vu des signaux",
      "time_horizon": "immédiat|court terme|moyen terme"
    }
  ],
  "period": "${today}",
  "signals_analyzed": ${signals.length}${evolutionSchema}
}

RÈGLES STRICTES :
- Cite tes sources avec [N] pour chaque affirmation factuelle.
- Analyse CHAQUE entreprise surveillée, même si les signaux sont inégaux.
- La section competitive_comparison est OBLIGATOIRE et doit comparer les entreprises entre elles.
- Si une entreprise fait quelque chose que les autres ne font pas, mentionne-le explicitement dans gaps_to_watch.
- Les recommandations doivent être ACTIONNABLES et spécifiques au contexte.
- NE PAS inventer de faits : base-toi uniquement sur les signaux fournis.
- PONDÈRE par la récence : les signaux récents (derniers mois) ont plus de poids que les anciens. Les dates de publication sont indiquées pour chaque signal. Mentionne les dates clés dans ton analyse.
- DONNÉES CHIFFRÉES : quand les signaux contiennent des montants (budgets, CA, investissements), volumes, pourcentages, effectifs, surfaces, capacités ou toute donnée quantitative, tu DOIS les reprendre dans l'analyse. Les chiffres concrets rendent le rapport exploitable. Exemples : "investissement de 12 milliards FCFA", "recrutement de 200 postes", "capacité de 50 000 tonnes/an", "croissance de 15%".${evolutionRules}
- Réponds en français.`

  try {
    const { text: responseText, tokensUsed } = await callGemini(prompt, {
      model:           'gemini-2.5-flash',
      maxOutputTokens: hasPreviousReports ? 8_000 : 6_000,
      temperature:     0.15,
    })

    log(`[Report] Gemini → ${responseText.length} chars, ${tokensUsed} tokens`)

    let reportContent = parseGeminiJson<any>(responseText)
    if (!reportContent) {
      log('[Report] ⚠ Parsing JSON échoué — fallback texte brut')
      const cleanText = responseText
        .replace(/```(?:json)?\s*\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      reportContent = {
        title: `Rapport de veille — ${today}`,
        executive_summary: cleanText.slice(0, 2000),
      }
    }

    // Enrichit les analyses entreprises avec URLs
    const enrichedCompanyAnalyses = (reportContent.company_analyses ?? []).map((ca: any) => ({
      ...ca,
      sources: (ca.source_refs ?? [])
        .map((ref: number) => sourcesIndex.find((s: any) => s.i === ref))
        .filter(Boolean),
    }))

    // Enrichit les alertes stratégiques
    const enrichedAlerts = (reportContent.strategic_alerts ?? []).map((a: any) => ({
      ...a,
      sources: (a.source_refs ?? [])
        .map((ref: number) => sourcesIndex.find((s: any) => s.i === ref))
        .filter(Boolean),
    }))

    const finalReport = {
      ...reportContent,
      company_analyses:    enrichedCompanyAnalyses,
      strategic_alerts:    enrichedAlerts,
      sources_index:       sourcesIndex,
      generated_at:        new Date().toISOString(),
      is_initial:          isInitial,
      previous_report_id:  prevReports[0]?.id ?? null,
      report_sequence:     prevReports.length + 1,
    }

    // ── Sauvegarde ─────────────────────────────────────────────────────────
    const reportType = hasPreviousReports ? 'synthesis' : 'analyse'
    const { data: report, error: repErr } = await supabase.from('reports').insert({
      watch_id:    watchId,
      account_id:  watch.account_id,
      type:        reportType,
      title:       finalReport.title ?? `Rapport — ${today}`,
      content:     finalReport,
      summary:     typeof finalReport.executive_summary === 'string'
        ? finalReport.executive_summary.slice(0, 2000)
        : `Rapport de veille — ${today}`,
      agent_used:  2,
      tokens_used: tokensUsed,
    }).select().single()

    if (repErr) {
      log(`[Report] Erreur sauvegarde rapport: ${repErr.message}`)
      return { reportId: null, insights: 0, sources: 0, skipped: true, reason: repErr.message }
    }

    // ── Marque les signaux comme traités ───────────────────────────────────
    await supabase
      .from('signals')
      .update({ is_processed: true })
      .in('id', signals.map((s: any) => s.id))

    // ── Notifie l'utilisateur ──────────────────────────────────────────────
    if (watch.account_id) {
      await supabase.from('alerts').insert({
        account_id: watch.account_id,
        watch_id:   watchId,
        type:       'report_ready',
        title:      isInitial ? 'Rapport initial disponible' : 'Nouveau rapport de veille',
        message:    `"${finalReport.title}" — ${enrichedCompanyAnalyses.length} entreprises analysées, ${sourcesIndex.length} sources citées.`,
      })
    }

    log(`[Report] ✓ Rapport créé: ${report?.id} | ${enrichedCompanyAnalyses.length} entreprises | ${sourcesIndex.length} sources`)

    return {
      reportId: report?.id ?? null,
      insights: enrichedCompanyAnalyses.length,
      sources:  sourcesIndex.length,
      skipped:  false,
    }
  } catch (e: any) {
    log(`[Report] ✗ Erreur génération: ${e?.message ?? e}`)
    return { reportId: null, insights: 0, sources: 0, skipped: true, reason: e?.message }
  }
}
