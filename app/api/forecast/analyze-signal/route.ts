import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import { extractArticle } from '@/lib/article-extractor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/forecast/analyze-signal
 * Body: { signalId: string, locale?: string }
 *
 * 1. Reads signal from DB
 * 2. If article_body not in data, fetches & extracts the article
 * 3. Generates a deep AI analysis using the full article text
 * 4. Stores result in data.ai_analysis for caching
 * 5. Returns the analysis JSON
 */
export async function POST(req: NextRequest) {
  try {
    const { signalId, locale = 'fr' } = await req.json()
    if (!signalId) return NextResponse.json({ error: 'signalId required' }, { status: 400 })

    const db = createAdminClient()

    const { data: signal, error } = await db
      .from('forecast_signal_feed')
      .select('id, title, summary, data, forecast_channels(name, slug)')
      .eq('id', signalId)
      .single()

    if (error || !signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 })
    }

    const data = (signal.data ?? {}) as Record<string, unknown>

    // Return cached analysis if available
    if (data.ai_analysis && typeof data.ai_analysis === 'object') {
      return NextResponse.json({ analysis: data.ai_analysis, cached: true })
    }

    let articleBody: string | null = (data.article_body as string) ?? null
    const sourceUrl = (data.source_url as string) ?? null

    if (!articleBody && sourceUrl) {
      const extracted = await extractArticle(sourceUrl)
      articleBody = extracted.body

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
    }

    const contentForAnalysis = articleBody
      ? `TITRE : ${signal.title}\n\nCONTENU COMPLET DE L'ARTICLE :\n${articleBody}`
      : `TITRE : ${signal.title}\n\nRÉSUMÉ : ${signal.summary}`

    const chArr = signal.forecast_channels as unknown as { name: string; slug: string }[] | null
    const ch = chArr?.[0] ?? null
    const channelContext = ch ? `Canal : ${ch.name} (${ch.slug})` : ''

    const prompt = buildAnalysisPrompt(contentForAnalysis, channelContext, locale, !!articleBody)

    const { text } = await callGemini(prompt, {
      maxOutputTokens: 4000,
      temperature: 0.2,
    })

    const analysis = parseGeminiJson<Record<string, unknown>>(text)

    if (!analysis) {
      return NextResponse.json({ error: 'AI analysis generation failed' }, { status: 500 })
    }

    // Cache the analysis in signal data
    await db
      .from('forecast_signal_feed')
      .update({ data: { ...data, article_body: articleBody ?? data.article_body, ai_analysis: analysis } })
      .eq('id', signalId)

    return NextResponse.json({ analysis, cached: false })

  } catch (err: unknown) {
    console.error('[analyze-signal] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function buildAnalysisPrompt(content: string, channelContext: string, locale: string, hasFullBody: boolean): string {
  const lang = locale === 'fr' ? 'français' : 'English'
  const depth = hasFullBody
    ? 'Tu as accès au contenu COMPLET de l\'article. Fournis une analyse détaillée et approfondie.'
    : 'Tu n\'as accès qu\'au résumé. Fournis l\'analyse la plus riche possible basée sur tes connaissances.'

  return [
    `Tu es un analyste géopolitique et économique senior spécialisé dans l'intelligence de marché.`,
    `${depth}`,
    channelContext,
    ``,
    `${content}`,
    ``,
    `Génère une analyse structurée et détaillée en ${lang}. Chaque section doit être substantielle (pas de bullet points vides).`,
    ``,
    `Format JSON STRICT (pas de markdown, pas de texte autour) :`,
    `{`,
    `  "executiveTakeaway": "Synthèse décisionnelle en 2-3 phrases percutantes. Quel est le message clé pour un décideur?",`,
    `  "whyThisMatters": [`,
    `    "Point 1 : contexte historique ou géopolitique (3-4 phrases)",`,
    `    "Point 2 : enjeux économiques concrets avec chiffres si disponibles (3-4 phrases)",`,
    `    "Point 3 : implications pour les acteurs de marché (3-4 phrases)"`,
    `  ],`,
    `  "immediateImplications": [`,
    `    "Impact 1 : conséquence directe dans les 0-30 jours (2-3 phrases)",`,
    `    "Impact 2 : réaction probable des marchés/institutions (2-3 phrases)",`,
    `    "Impact 3 : mesures à prendre immédiatement (2-3 phrases)"`,
    `  ],`,
    `  "secondOrderEffects": [`,
    `    "Effet cascade 1 : conséquence indirecte à moyen terme 3-12 mois (2-3 phrases)",`,
    `    "Effet cascade 2 : impact sur les chaînes de valeur (2-3 phrases)",`,
    `    "Effet cascade 3 : changements structurels possibles (2-3 phrases)"`,
    `  ],`,
    `  "regionalImplications": [`,
    `    { "region": "Nom de la région", "implications": ["Implication détaillée 1 (2 phrases)", "Implication détaillée 2 (2 phrases)"] }`,
    `  ],`,
    `  "sectorExposure": [`,
    `    { "sector": "Nom du secteur", "riskLevel": "high|medium|low", "notes": ["Analyse détaillée 1 (2 phrases)", "Analyse détaillée 2 (2 phrases)"] }`,
    `  ],`,
    `  "whatToWatch": [`,
    `    "Indicateur/événement 1 à surveiller avec explication de pourquoi (2-3 phrases)",`,
    `    "Indicateur/événement 2 avec seuil critique à surveiller (2-3 phrases)",`,
    `    "Indicateur/événement 3 avec timeline estimée (2-3 phrases)"`,
    `  ],`,
    `  "confidenceNote": "Note sur le niveau de confiance de l'analyse, les données manquantes et les biais possibles (2-3 phrases)"`,
    `}`,
    ``,
    `IMPORTANT : Chaque section doit contenir au minimum 2 éléments riches et détaillés. Utilise des chiffres, des données, des comparaisons historiques quand possible. Ne laisse aucune section vide.`,
  ].join('\n')
}
