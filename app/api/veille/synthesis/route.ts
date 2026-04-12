import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const { watchId, category } = await req.json()
    if (!watchId) return NextResponse.json({ error: 'watchId requis' }, { status: 400 })

    const supabase = createAdminClient()

    let query = supabase
      .from('signals')
      .select('title, raw_content, severity, category, region, data')
      .eq('watch_id', watchId)
      .order('collected_at', { ascending: false })
      .limit(30)

    if (category) {
      query = query.eq('category', category)
    }

    const { data: signals, error: sigErr } = await query
    if (sigErr) return NextResponse.json({ error: sigErr.message }, { status: 500 })
    if (!signals || signals.length === 0) {
      return NextResponse.json({ error: 'Aucun signal trouvé pour cette catégorie.' }, { status: 404 })
    }

    const signalsSummary = signals.map((s: any, i: number) => {
      const data = (s.data ?? {}) as Record<string, any>
      return `${i + 1}. [${s.severity ?? 'medium'}] ${s.title}\n   ${s.raw_content?.slice(0, 200) ?? ''}\n   Région: ${s.region ?? 'N/A'} | Source: ${data.source_hint ?? data.article_publisher ?? 'N/A'}`
    }).join('\n\n')

    const categoryLabel = category || 'toutes catégories'

    const prompt = [
      `Tu es un analyste en veille concurrentielle senior.`,
      `Génère une synthèse structurée et actionnable en français des signaux ci-dessous.`,
      category ? `Focus catégorie : ${category}` : 'Synthèse globale de tous les signaux.',
      ``,
      `--- SIGNAUX (${signals.length}) ---`,
      signalsSummary,
      `--- FIN ---`,
      ``,
      `Retourne un JSON valide :`,
      `{`,
      `  "title": "Titre de la synthèse (${categoryLabel})",`,
      `  "executive_summary": "Résumé exécutif (3-4 phrases)",`,
      `  "key_findings": ["Finding 1", "Finding 2", "Finding 3"],`,
      `  "opportunities": ["Opportunité 1", "Opportunité 2"],`,
      `  "risks": ["Risque 1", "Risque 2"],`,
      `  "recommendations": ["Recommandation actionnable 1", "Recommandation 2"],`,
      `  "signals_analyzed": ${signals.length}`,
      `}`,
    ].join('\n')

    const { text } = await callGemini(prompt, { maxOutputTokens: 3000, temperature: 0.2 })
    const synthesis = parseGeminiJson<any>(text)

    if (!synthesis?.executive_summary) {
      return NextResponse.json({ error: 'Synthèse invalide' }, { status: 500 })
    }

    return NextResponse.json({ synthesis, category: category ?? null, signals_count: signals.length })
  } catch (err: any) {
    console.error('[veille/synthesis] Error:', err)
    return NextResponse.json({ error: err?.message ?? 'Erreur' }, { status: 500 })
  }
}
