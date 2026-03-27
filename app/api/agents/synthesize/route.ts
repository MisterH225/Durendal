import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { watchId } = await req.json()

    const { data: watch } = await supabase
      .from('watches').select('*, watch_companies(companies(name))').eq('id', watchId).single()
    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    // Récupère les signaux non traités, avec leurs URLs sources
    const { data: signals } = await supabase
      .from('signals')
      .select('*, companies(name)')
      .eq('watch_id', watchId)
      .eq('is_processed', false)
      .order('relevance_score', { ascending: false })
      .limit(60)

    if (!signals || signals.length === 0) {
      return NextResponse.json({ message: 'Aucun signal à traiter' })
    }

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 2, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    const companies = watch.watch_companies?.map((wc: any) => wc.companies?.name).join(', ')

    // Construit le contexte des signaux en incluant les URLs (pour les citations)
    const signalsText = signals.map((s: any, i: number) => {
      const sourceLabel = s.source_name || (s.url ? new URL(s.url).hostname : 'Source inconnue')
      return `[${i + 1}] ${s.companies?.name || 'Inconnu'} — ${s.title}\n${s.raw_content?.slice(0, 400)}\nSource : ${sourceLabel}${s.url ? ` (${s.url})` : ''}`
    }).join('\n\n---\n\n')

    // Construit la liste des sources numérotées pour les citations
    const sourcesIndex = signals
      .map((s: any, i: number) => ({ i: i + 1, url: s.url, title: s.source_name || s.title }))
      .filter(s => s.url)

    const prompt = `Tu es un analyste expert en veille concurrentielle pour les marchés africains.

Analyse ces ${signals.length} signaux sur les entreprises : ${companies}
Marchés : ${watch.countries?.join(', ')} | Secteurs : ${watch.sectors?.join(', ')}

SIGNAUX COLLECTÉS (avec sources vérifiables) :
${signalsText}

Génère un rapport de veille structuré en JSON. Pour chaque insight, cite le numéro de source entre crochets [1], [2]...
{
  "title": "Rapport de veille — [date du jour]",
  "executive_summary": "Résumé factuel en 3-5 phrases, basé uniquement sur les signaux ci-dessus",
  "key_insights": [
    {
      "company": "Nom de l'entreprise",
      "insight": "Information factuelle avec citation [N]",
      "importance": "high|medium|low",
      "type": "news|funding|product|recruitment|partnership",
      "source_refs": [1, 2]
    }
  ],
  "trends": ["tendance observée dans les signaux 1", "tendance 2", "tendance 3"],
  "alerts": ["alerte si un concurrent fait une action urgente à surveiller"],
  "period": "Analyse des dernières actualités disponibles",
  "signals_analyzed": ${signals.length}
}`

    const { text: responseText, tokensUsed } = await callGemini(prompt, { maxOutputTokens: 2500 })

    let reportContent = parseGeminiJson<any>(responseText)
    if (!reportContent) {
      reportContent = { title: 'Rapport de veille', executive_summary: responseText }
    }

    // Enrichit le rapport avec les vraies URLs des sources citées
    const enrichedInsights = (reportContent.key_insights || []).map((insight: any) => ({
      ...insight,
      sources: (insight.source_refs || [])
        .map((ref: number) => sourcesIndex.find(s => s.i === ref))
        .filter(Boolean),
    }))

    const finalReport = {
      ...reportContent,
      key_insights: enrichedInsights,
      sources_index: sourcesIndex,
    }

    const { data: report } = await supabase.from('reports').insert({
      watch_id:    watchId,
      account_id:  watch.account_id,
      type:        'synthesis',
      title:       finalReport.title || `Rapport — ${new Date().toLocaleDateString('fr-FR')}`,
      content:     finalReport,
      summary:     finalReport.executive_summary,
      agent_used:  2,
      tokens_used: tokensUsed,
    }).select().single()

    await supabase.from('signals')
      .update({ is_processed: true })
      .in('id', signals.map((s: any) => s.id))

    await supabase.from('agent_jobs').update({
      status: 'done', completed_at: new Date().toISOString(),
      result_id: report?.id, tokens_used: tokensUsed,
    }).eq('id', job?.id)

    await supabase.from('alerts').insert({
      account_id: watch.account_id, watch_id: watchId,
      type:    'report_ready',
      title:   'Rapport de synthèse prêt',
      message: `Votre rapport "${finalReport.title}" est disponible avec ${sourcesIndex.length} sources citées.`,
    })

    return NextResponse.json({
      success:    true,
      reportId:   report?.id,
      insights:   enrichedInsights.length,
      sources:    sourcesIndex.length,
    })
  } catch (error) {
    console.error('[Agent2] Erreur:', error)
    return NextResponse.json({ error: 'Erreur agent synthèse' }, { status: 500 })
  }
}
