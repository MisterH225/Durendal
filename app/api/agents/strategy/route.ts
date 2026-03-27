import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { watchId } = await req.json()

    const { data: watch } = await supabase
      .from('watches').select('*').eq('id', watchId).single()
    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    // Récupère les rapports récents (Agent 2 & 3)
    const { data: reports } = await supabase
      .from('reports')
      .select('title, content, summary, type')
      .eq('watch_id', watchId)
      .in('type', ['synthesis', 'market'])
      .order('generated_at', { ascending: false })
      .limit(5)

    if (!reports || reports.length === 0) {
      return NextResponse.json({ message: 'Pas assez de données — lancez d\'abord les agents 1 et 2' })
    }

    const { data: job } = await supabase
      .from('agent_jobs')
      .insert({ watch_id: watchId, agent_number: 4, status: 'running', started_at: new Date().toISOString() })
      .select().single()

    const reportsContext = reports.map((r: any) =>
      `[${r.type.toUpperCase()}] ${r.title}\n${r.summary || JSON.stringify(r.content).slice(0, 800)}`
    ).join('\n\n---\n\n')

    const prompt = `Tu es un consultant senior en stratégie de marché africain, spécialisé dans les marchés : ${watch.countries?.join(', ')}.

Sur la base de ces analyses de veille concurrentielle :
${reportsContext}

Génère 3 recommandations stratégiques actionnables en JSON :
{
  "recommendations": [
    {
      "title": "Titre de l'action stratégique",
      "description": "Description détaillée de l'opportunité ou menace (3-5 phrases)",
      "priority": "high|medium|low",
      "type": "market_entry|partnership|defense|new_segment",
      "confidence_score": 0.85,
      "time_horizon": "1-3 months|3-6 months|6-12 months",
      "risks": ["risque 1", "risque 2"],
      "actions": ["action concrète 1", "action concrète 2", "action concrète 3"]
    }
  ]
}`

    const { text: responseText, tokensUsed } = await callGemini(prompt, { maxOutputTokens: 2000 })
    const data = { usage: { output_tokens: tokensUsed } }

    const parsed = parseGeminiJson<{ recommendations: any[] }>(responseText)

    if (!parsed?.recommendations) {
      return NextResponse.json({ error: 'Format de réponse invalide' }, { status: 500 })
    }

    // Sauvegarde chaque recommandation
    const savedRecs = []
    for (const rec of parsed.recommendations) {
      const { data: saved } = await supabase.from('recommendations').insert({
        watch_id: watchId,
        account_id: watch.account_id,
        title: rec.title,
        description: rec.description,
        priority: rec.priority,
        type: rec.type,
        confidence_score: rec.confidence_score,
        time_horizon: rec.time_horizon,
        risks: rec.risks,
        actions: rec.actions,
      }).select().single()
      if (saved) savedRecs.push(saved)
    }

    await supabase.from('agent_jobs').update({
      status: 'done', completed_at: new Date().toISOString(),
      tokens_used: data.usage?.output_tokens || 0,
    }).eq('id', job?.id)

    await supabase.from('alerts').insert({
      account_id: watch.account_id, watch_id: watchId,
      type: 'signal',
      title: `${savedRecs.length} recommandations stratégiques disponibles`,
      message: `L'agent stratégie a identifié ${savedRecs.length} opportunités pour votre veille.`,
    })

    return NextResponse.json({ success: true, recommendations: savedRecs.length })
  } catch (error) {
    console.error('Agent 4 error:', error)
    return NextResponse.json({ error: 'Erreur agent stratégie' }, { status: 500 })
  }
}
