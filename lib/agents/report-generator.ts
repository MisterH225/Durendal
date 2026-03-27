/**
 * report-generator.ts
 * Génération inline de rapport — reproduit generateWatchReport() de VeilleCI.
 *
 * Appelé DIRECTEMENT (pas via HTTP) depuis le scrape route après la collecte.
 * Élimine le fire-and-forget instable au profit d'une exécution garantie.
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
 * Génère un rapport de veille structuré à partir des signaux non traités.
 * Reproduit generateWatchReport() de VeilleCI (collector-engine.ts L720-851).
 *
 * @param supabase  Client Supabase (avec session utilisateur)
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
  log('[Report] Génération du rapport de veille...')

  // ── Récupère les signaux non traités ─────────────────────────────────────
  const { data: signals, error: sigErr } = await supabase
    .from('signals')
    .select('*, companies(name)')
    .eq('watch_id', watchId)
    .eq('is_processed', false)
    .order('relevance_score', { ascending: false })
    .limit(60)

  if (sigErr) {
    log(`[Report] Erreur récupération signaux: ${sigErr.message}`)
    return { reportId: null, insights: 0, sources: 0, skipped: true, reason: sigErr.message }
  }

  if (!signals || signals.length === 0) {
    log('[Report] Aucun signal à synthétiser — rapport ignoré')
    return { reportId: null, insights: 0, sources: 0, skipped: true, reason: 'no_signals' }
  }

  log(`[Report] ${signals.length} signaux à synthétiser`)

  // ── Construit le contexte pour le LLM ────────────────────────────────────
  const companiesStr = watch.watch_companies
    ?.map((wc: any) => wc.companies?.name)
    .filter(Boolean)
    .join(', ') ?? ''

  const signalsText = signals.map((s: any, i: number) => {
    const sourceLabel = s.source_name
      || (s.url ? (() => { try { return new URL(s.url).hostname } catch { return s.url } })() : 'Source inconnue')
    return [
      `[${i + 1}] ${s.companies?.name ?? 'Inconnu'} — ${s.title}`,
      s.raw_content?.slice(0, 400) ?? '',
      `Source : ${sourceLabel}${s.url ? ` (${s.url})` : ''}`,
    ].join('\n')
  }).join('\n\n---\n\n')

  // Index des sources pour citations croisées
  const sourcesIndex = signals
    .map((s: any, i: number) => ({ i: i + 1, url: s.url, title: s.source_name || s.title }))
    .filter((s: any) => s.url)

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })

  const prompt = `Tu es un analyste expert en veille concurrentielle pour les marchés africains.

Analyse ces ${signals.length} signaux sur les entreprises : ${companiesStr}
Marchés : ${(watch.countries ?? []).join(', ')} | Secteurs : ${(watch.sectors ?? []).join(', ')}
Date : ${today}

SIGNAUX COLLECTÉS (avec sources vérifiables) :
${signalsText}

Génère un rapport de veille structuré en JSON. Pour chaque insight, cite le numéro de source entre crochets [1], [2]…
{
  "title": "Rapport de veille — ${today}",
  "executive_summary": "Résumé factuel en 3-5 phrases, basé uniquement sur les signaux ci-dessus",
  "key_insights": [
    {
      "company": "Nom de l'entreprise",
      "insight": "Information factuelle avec citation [N]",
      "importance": "high|medium|low",
      "type": "news|funding|product|recruitment|partnership|contract|financial",
      "source_refs": [1, 2]
    }
  ],
  "trends": ["tendance observée dans les signaux 1", "tendance 2", "tendance 3"],
  "alerts": ["alerte urgente si un concurrent fait une action importante"],
  "recommendations": ["action à envisager à court terme", "action à moyen terme"],
  "period": "Analyse des dernières actualités disponibles",
  "signals_analyzed": ${signals.length}
}`

  try {
    const { text: responseText, tokensUsed } = await callGemini(prompt, {
      model:           'gemini-2.5-flash',
      maxOutputTokens: 2_500,
      temperature:     0.2,
    })

    let reportContent = parseGeminiJson<any>(responseText)
    if (!reportContent) {
      reportContent = { title: `Rapport de veille — ${today}`, executive_summary: responseText }
    }

    // Enrichit les insights avec les vraies URLs des sources citées
    const enrichedInsights = (reportContent.key_insights ?? []).map((insight: any) => ({
      ...insight,
      sources: (insight.source_refs ?? [])
        .map((ref: number) => sourcesIndex.find((s: any) => s.i === ref))
        .filter(Boolean),
    }))

    const finalReport = {
      ...reportContent,
      key_insights:  enrichedInsights,
      sources_index: sourcesIndex,
      generated_at:  new Date().toISOString(),
      is_initial:    isInitial,
    }

    // ── Sauvegarde le rapport ───────────────────────────────────────────────
    const { data: report, error: repErr } = await supabase.from('reports').insert({
      watch_id:    watchId,
      account_id:  watch.account_id,
      type:        isInitial ? 'analyse' : 'synthesis',
      title:       finalReport.title ?? `Rapport — ${today}`,
      content:     finalReport,
      summary:     finalReport.executive_summary,
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
        message:    `"${finalReport.title}" — ${enrichedInsights.length} insights, ${sourcesIndex.length} sources citées.`,
      })
    }

    log(`[Report] ✓ Rapport créé: ${report?.id} | ${enrichedInsights.length} insights | ${sourcesIndex.length} sources`)

    return {
      reportId: report?.id ?? null,
      insights: enrichedInsights.length,
      sources:  sourcesIndex.length,
      skipped:  false,
    }
  } catch (e: any) {
    log(`[Report] ✗ Erreur génération: ${e?.message ?? e}`)
    return { reportId: null, insights: 0, sources: 0, skipped: true, reason: e?.message }
  }
}
