import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/forecast/backfill-analysis?limit=5
 * 
 * One-shot backfill: generates AI analysis for signals that don't have one yet.
 * Processes `limit` signals (default 3) per call to stay within timeouts.
 */
export async function GET(req: NextRequest) {

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '3'), 10)
  const db = createAdminClient()

  const { data: signals, error } = await db
    .from('forecast_signal_feed')
    .select('id, title, summary, data, forecast_channels(name)')
    .eq('signal_type', 'news')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !signals) {
    return NextResponse.json({ error: error?.message ?? 'No signals' }, { status: 500 })
  }

  const needsAnalysis = signals.filter(s => {
    const d = (s.data ?? {}) as Record<string, unknown>
    const cached = d.ai_analysis as Record<string, unknown> | undefined
    return !cached || !cached.executiveTakeaway
  }).slice(0, limit)

  const results: Record<string, string> = {}

  for (const sig of needsAnalysis) {
    const d = (sig.data ?? {}) as Record<string, unknown>
    const body = (d.article_body as string) ?? null
    const chArr = sig.forecast_channels as unknown as { name: string }[] | null
    const channelName = chArr?.[0]?.name ?? 'General'

    const content = body
      ? `TITRE : ${sig.title}\n\nARTICLE :\n${body.slice(0, 10000)}`
      : `TITRE : ${sig.title}\n\nRÉSUMÉ : ${sig.summary}`

    const prompt = [
      `Analyste économique senior. Canal : ${channelName}`,
      ``,
      content,
      ``,
      `Analyse en français. JSON sans markdown :`,
      `{"executiveTakeaway":"2-3 phrases","whyThisMatters":["pt1","pt2"],"immediateImplications":["i1","i2"],"secondOrderEffects":["e1","e2"],"regionalImplications":[{"region":"Nom","implications":["i1"]}],"sectorExposure":[{"sector":"Nom","riskLevel":"high","notes":["n1"]}],"whatToWatch":["w1","w2"],"confidenceNote":"note"}`,
    ].join('\n')

    try {
      const { text } = await callGemini(prompt, {
        maxOutputTokens: 3000,
        temperature: 0.2,
      })

      const analysis = parseGeminiJson<Record<string, unknown>>(text)

      if (analysis?.executiveTakeaway) {
        await db
          .from('forecast_signal_feed')
          .update({ data: { ...d, ai_analysis: analysis } })
          .eq('id', sig.id)

        results[sig.id] = 'ok'
      } else {
        results[sig.id] = 'empty_analysis'
      }
    } catch (err: any) {
      results[sig.id] = `error: ${err.message?.slice(0, 80)}`
    }

    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({
    total_checked: signals.length,
    needed_analysis: needsAnalysis.length,
    results,
  })
}
