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

    // Récupère les signaux non traités
    const { data: signals } = await supabase
      .from('signals')
      .select('*, companies(name), sources(name)')
      .eq('watch_id', watchId)
      .eq('is_processed', false)
      .order('relevance_score', { ascending: false })
      .limit(50)

    if (!signals || signals.length === 0) {
      return NextResponse.json({ message: 'Aucun signal à traiter' })
    }

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 2, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    // Prépare le contenu pour Claude Sonnet
    const signalsText = signals.map((s: any) =>
      `[${s.companies?.name || 'Inconnu'}] (Source: ${s.sources?.name}) ${s.title}\n${s.raw_content?.slice(0, 500)}`
    ).join('\n\n---\n\n')

    const companies = watch.watch_companies?.map((wc: any) => wc.companies?.name).join(', ')

    // Génère le rapport avec Gemini Flash
    const prompt = `Tu es un analyste expert en veille concurrentielle pour les marchés africains.

Analyse ces signaux concurrentiels sur les entreprises suivantes : ${companies}
Marchés : ${watch.countries?.join(', ')} | Secteurs : ${watch.sectors?.join(', ')}

SIGNAUX COLLECTÉS :
${signalsText}

Génère un rapport de veille structuré en JSON avec ce format exact :
{
  "title": "Rapport de veille — [date]",
  "executive_summary": "Résumé exécutif en 3-5 phrases",
  "key_insights": [
    {"company": "...", "insight": "...", "importance": "high|medium|low", "type": "news|funding|product|recruitment|partnership"}
  ],
  "trends": ["tendance 1", "tendance 2", "tendance 3"],
  "alerts": ["alerte urgente 1 si applicable"],
  "period": "Dernières 24-48h",
  "signals_analyzed": ${signals.length}
}`

    const { text: responseText, tokensUsed } = await callGemini(prompt, { maxOutputTokens: 2000 })

    let reportContent = parseGeminiJson<any>(responseText)
    if (!reportContent) {
      reportContent = { title: 'Rapport de veille', executive_summary: responseText }
    }
    const data = { usage: { output_tokens: tokensUsed } }

    // Sauvegarde le rapport
    const { data: report } = await supabase.from('reports').insert({
      watch_id: watchId,
      account_id: watch.account_id,
      type: 'synthesis',
      title: reportContent.title || `Rapport — ${new Date().toLocaleDateString('fr-FR')}`,
      content: reportContent,
      summary: reportContent.executive_summary,
      agent_used: 2,
      tokens_used: data.usage?.output_tokens || 0,
    }).select().single()

    // Marque les signaux comme traités
    await supabase.from('signals')
      .update({ is_processed: true })
      .in('id', signals.map((s: any) => s.id))

    // Finalise le job
    await supabase.from('agent_jobs').update({
      status: 'done', completed_at: new Date().toISOString(),
      result_id: report?.id, tokens_used: data.usage?.output_tokens || 0,
    }).eq('id', job?.id)

    // Alerte rapport prêt
    await supabase.from('alerts').insert({
      account_id: watch.account_id, watch_id: watchId,
      type: 'report_ready',
      title: `Rapport de synthèse prêt`,
      message: `Votre rapport "${reportContent.title}" est disponible.`,
    })

    return NextResponse.json({ success: true, reportId: report?.id, insights: reportContent.key_insights?.length || 0 })
  } catch (error) {
    console.error('Agent 2 error:', error)
    return NextResponse.json({ error: 'Erreur agent synthèse' }, { status: 500 })
  }
}
