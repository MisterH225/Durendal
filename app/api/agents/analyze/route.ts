import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { watchId } = await req.json()

    const { data: watch } = await supabase
      .from('watches')
      .select('*, watch_companies(companies(name, country, sector))')
      .eq('id', watchId)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    // Récupère les synthèses de l'agent 2
    const { data: syntheses } = await supabase
      .from('reports')
      .select('title, content, summary')
      .eq('watch_id', watchId)
      .eq('type', 'synthesis')
      .order('generated_at', { ascending: false })
      .limit(10)

    if (!syntheses?.length) {
      return NextResponse.json({ message: 'Aucune synthèse disponible — lancez d\'abord l\'agent 2' })
    }

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 3, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    const companies = watch.watch_companies?.map((wc: any) => wc.companies?.name).join(', ')
    const synthesesContext = syntheses.map((s: any) =>
      `${s.title}\n${s.summary || JSON.stringify(s.content?.key_insights || []).slice(0, 500)}`
    ).join('\n\n---\n\n')

    const prompt = `Tu es un expert en analyse de marché africain, spécialisé sur ${watch.countries?.join(', ')}.

Analyse ces données de veille sur les entreprises : ${companies}
Secteurs : ${watch.sectors?.join(', ')} | Marchés : ${watch.countries?.join(', ')}

DONNÉES DE SYNTHÈSE :
${synthesesContext}

Produis une analyse de marché structurée en JSON :
{
  "title": "Analyse de marché — [secteur] [pays] — [date]",
  "executive_summary": "Résumé en 3-5 phrases du state of the market",
  "market_size": "Estimation qualitative du marché",
  "growth_trend": "positive|negative|stable",
  "key_players": [
    {"name": "...", "position": "leader|challenger|niche", "momentum": "growing|declining|stable", "market_share_est": "..."}
  ],
  "trends": [
    {"trend": "...", "impact": "high|medium|low", "timeframe": "short|medium|long"}
  ],
  "opportunities": ["opportunité 1", "opportunité 2", "opportunité 3"],
  "threats": ["menace 1", "menace 2"],
  "market_gaps": ["segment non couvert 1", "segment non couvert 2"],
  "signals_analyzed": ${syntheses.length}
}`

    const { text: responseText, tokensUsed } = await callGemini(prompt, { maxOutputTokens: 2000 })

    let reportContent = parseGeminiJson<any>(responseText)
    if (!reportContent) {
      reportContent = { title: 'Analyse de marché', executive_summary: responseText }
    }
    const data = { usage: { output_tokens: tokensUsed } }

    const { data: report } = await supabase.from('reports').insert({
      watch_id: watchId,
      account_id: watch.account_id,
      type: 'market',
      title: reportContent.title || `Analyse marché — ${new Date().toLocaleDateString('fr-FR')}`,
      content: reportContent,
      summary: reportContent.executive_summary,
      agent_used: 3,
      tokens_used: data.usage?.output_tokens || 0,
    }).select().single()

    await supabase.from('agent_jobs').update({
      status: 'done', completed_at: new Date().toISOString(),
      result_id: report?.id, tokens_used: data.usage?.output_tokens || 0,
    }).eq('id', job?.id)

    await supabase.from('alerts').insert({
      account_id: watch.account_id, watch_id: watchId,
      type: 'report_ready',
      title: 'Analyse de marché disponible',
      message: `L'analyse "${reportContent.title}" est prête.`,
    })

    return NextResponse.json({ success: true, reportId: report?.id, trends: reportContent.trends?.length || 0 })
  } catch (error) {
    console.error('Agent 3 error:', error)
    return NextResponse.json({ error: 'Erreur agent analyse marché' }, { status: 500 })
  }
}
