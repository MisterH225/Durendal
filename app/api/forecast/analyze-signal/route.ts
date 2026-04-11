import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import { extractArticle } from '@/lib/article-extractor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  let step = 'init'

  try {
    const { signalId, locale = 'fr' } = await req.json()
    if (!signalId) return NextResponse.json({ error: 'signalId required' }, { status: 400 })

    step = 'db-fetch'
    const db = createAdminClient()

    const { data: signal, error } = await db
      .from('forecast_signal_feed')
      .select('id, title, summary, data, forecast_channels(name, slug)')
      .eq('id', signalId)
      .single()

    if (error || !signal) {
      console.error(`[analyze-signal] Signal not found: ${signalId}`, error?.message)
      return NextResponse.json({ error: 'Signal not found', details: error?.message }, { status: 404 })
    }

    const data = (signal.data ?? {}) as Record<string, unknown>

    // Return cached analysis if available
    if (data.ai_analysis && typeof data.ai_analysis === 'object') {
      const cached = data.ai_analysis as Record<string, unknown>
      if (cached.executiveTakeaway) {
        console.log(`[analyze-signal] Cache hit for ${signalId} (${Date.now() - t0}ms)`)
        return NextResponse.json({ analysis: cached, cached: true })
      }
    }

    // Try to get or fetch article body
    step = 'extract-article'
    let articleBody: string | null = (data.article_body as string) ?? null
    const sourceUrl = (data.source_url as string) ?? null

    if (!articleBody && sourceUrl) {
      console.log(`[analyze-signal] Extracting article from: ${sourceUrl.slice(0, 80)}`)
      try {
        const extracted = await extractArticle(sourceUrl)
        articleBody = extracted.body
        console.log(`[analyze-signal] Extraction: ${articleBody ? `${articleBody.length} chars` : 'no body found'}`)

        if (articleBody) {
          const updatedData: Record<string, unknown> = { ...data, article_body: articleBody }
          if (extracted.author) updatedData.article_author = extracted.author
          if (extracted.publishedAt) updatedData.article_published = extracted.publishedAt
          if (extracted.publisher) updatedData.article_publisher = extracted.publisher
          if (extracted.imageUrl && !data.image_url) updatedData.image_url = extracted.imageUrl

          await db
            .from('forecast_signal_feed')
            .update({ data: updatedData })
            .eq('id', signalId)
        }
      } catch (extractErr) {
        console.error(`[analyze-signal] Extraction failed:`, extractErr)
      }
    } else if (articleBody) {
      console.log(`[analyze-signal] Using stored article body (${articleBody.length} chars)`)
    }

    step = 'gemini-call'
    const contentForAnalysis = articleBody
      ? `TITRE : ${signal.title}\n\nCONTENU COMPLET DE L'ARTICLE :\n${articleBody.slice(0, 12000)}`
      : `TITRE : ${signal.title}\n\nRÉSUMÉ : ${signal.summary}`

    const chArr = signal.forecast_channels as unknown as { name: string; slug: string }[] | null
    const ch = chArr?.[0] ?? null
    const channelContext = ch ? `Canal : ${ch.name} (${ch.slug})` : ''

    console.log(`[analyze-signal] Calling Gemini (body: ${!!articleBody}, content: ${contentForAnalysis.length} chars)`)

    const prompt = buildAnalysisPrompt(contentForAnalysis, channelContext, locale, !!articleBody)

    const { text } = await callGemini(prompt, {
      maxOutputTokens: 4000,
      temperature: 0.2,
    })

    console.log(`[analyze-signal] Gemini response: ${text.length} chars`)

    step = 'parse'
    const analysis = parseGeminiJson<Record<string, unknown>>(text)

    if (!analysis) {
      console.error(`[analyze-signal] Parse failed. Raw text (first 500 chars): ${text.slice(0, 500)}`)
      return NextResponse.json({
        error: 'AI analysis parse failed',
        details: 'Gemini returned unparseable content',
      }, { status: 500 })
    }

    // Validate the analysis has at least some content
    const hasContent = analysis.executiveTakeaway
      || (Array.isArray(analysis.whyThisMatters) && analysis.whyThisMatters.length > 0)
      || (Array.isArray(analysis.immediateImplications) && analysis.immediateImplications.length > 0)

    if (!hasContent) {
      console.error(`[analyze-signal] Empty analysis generated. Keys: ${Object.keys(analysis).join(', ')}`)
      return NextResponse.json({
        error: 'Empty analysis',
        details: 'AI generated an analysis with no content',
      }, { status: 500 })
    }

    step = 'cache'
    await db
      .from('forecast_signal_feed')
      .update({ data: { ...data, article_body: articleBody ?? data.article_body, ai_analysis: analysis } })
      .eq('id', signalId)

    console.log(`[analyze-signal] Done for ${signalId} in ${Date.now() - t0}ms`)
    return NextResponse.json({ analysis, cached: false })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[analyze-signal] Error at step "${step}": ${msg}`)
    return NextResponse.json({
      error: `Analysis failed at step: ${step}`,
      details: msg,
    }, { status: 500 })
  }
}

function buildAnalysisPrompt(content: string, channelContext: string, locale: string, hasFullBody: boolean): string {
  const lang = locale === 'fr' ? 'français' : 'English'
  const depth = hasFullBody
    ? 'Tu as accès au contenu COMPLET de l\'article. Fournis une analyse détaillée et approfondie basée sur ce contenu.'
    : 'Tu n\'as accès qu\'au résumé de l\'article. Utilise tes connaissances pour enrichir l\'analyse autant que possible.'

  return [
    `Tu es un analyste géopolitique et économique senior spécialisé dans l'intelligence de marché et les marchés émergents.`,
    depth,
    channelContext,
    ``,
    `--- DÉBUT DU CONTENU ---`,
    content,
    `--- FIN DU CONTENU ---`,
    ``,
    `Génère une analyse structurée et détaillée en ${lang}.`,
    `Chaque section doit être SUBSTANTIELLE avec des phrases complètes, des chiffres et des faits.`,
    `NE LAISSE AUCUNE SECTION VIDE. Chaque tableau doit contenir au minimum 2-3 éléments détaillés.`,
    ``,
    `Retourne UNIQUEMENT un objet JSON valide (pas de markdown, pas de \`\`\`, pas de texte autour) :`,
    `{`,
    `  "executiveTakeaway": "Synthèse décisionnelle en 2-3 phrases. Quel est le message clé pour un décideur?",`,
    `  "whyThisMatters": [`,
    `    "Contexte géopolitique/historique en 3-4 phrases avec comparaisons",`,
    `    "Enjeux économiques concrets avec chiffres en 3-4 phrases",`,
    `    "Implications pour investisseurs et entreprises en 3-4 phrases"`,
    `  ],`,
    `  "immediateImplications": [`,
    `    "Conséquence directe 0-30 jours en 2-3 phrases",`,
    `    "Réaction probable des marchés/institutions en 2-3 phrases",`,
    `    "Mesures à prendre immédiatement en 2-3 phrases"`,
    `  ],`,
    `  "secondOrderEffects": [`,
    `    "Conséquence indirecte à moyen terme 3-12 mois en 2-3 phrases",`,
    `    "Impact sur les chaînes de valeur en 2-3 phrases",`,
    `    "Changements structurels possibles en 2-3 phrases"`,
    `  ],`,
    `  "regionalImplications": [`,
    `    { "region": "Nom", "implications": ["Implication 1 détaillée", "Implication 2 détaillée"] }`,
    `  ],`,
    `  "sectorExposure": [`,
    `    { "sector": "Nom", "riskLevel": "high", "notes": ["Analyse 1", "Analyse 2"] }`,
    `  ],`,
    `  "whatToWatch": [`,
    `    "Indicateur à surveiller avec explication en 2-3 phrases",`,
    `    "Seuil critique avec timeline en 2-3 phrases"`,
    `  ],`,
    `  "confidenceNote": "Niveau de confiance et biais possibles en 2-3 phrases"`,
    `}`,
  ].join('\n')
}
