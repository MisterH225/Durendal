import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import { extractArticle } from '@/lib/article-extractor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Types for the event-driven context injected into the prompt ──────────────

interface AnalysisContext {
  event?: { title: string; description: string | null } | null
  questions?: { title: string; blended_probability: number | null; status: string; close_date: string | null }[]
  recentSignals?: { title: string; summary: string | null }[]
  markets?: { title: string; probability: number | null }[]
}

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
      .select(`
        id, title, summary, data, event_id, question_id, channel_id,
        forecast_channels(name, slug),
        forecast_events(id, title, description, status),
        forecast_questions(id, slug, title, blended_probability, status, close_date)
      `)
      .eq('id', signalId)
      .single()

    if (error || !signal) {
      console.error(`[analyze-signal] Signal not found: ${signalId}`, error?.message)
      return NextResponse.json({ error: 'Signal not found', details: error?.message }, { status: 404 })
    }

    const s = signal as Record<string, any>
    const data = (s.data ?? {}) as Record<string, unknown>

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

    // ── Load event-driven context in parallel ────────────────────────────────
    step = 'context-fetch'
    const context = await loadAnalysisContext(db, s, signalId)

    step = 'gemini-call'
    const contentForAnalysis = articleBody
      ? `TITRE : ${signal.title}\n\nCONTENU COMPLET DE L'ARTICLE :\n${articleBody.slice(0, 12000)}`
      : `TITRE : ${signal.title}\n\nRÉSUMÉ : ${signal.summary}`

    const chArr = s.forecast_channels as { name: string; slug: string }[] | null
    const ch = Array.isArray(chArr) ? chArr[0] : chArr
    const channelContext = ch ? `Canal : ${ch.name} (${ch.slug})` : ''

    const contextSize = (context.questions?.length ?? 0) + (context.recentSignals?.length ?? 0) + (context.markets?.length ?? 0)
    console.log(`[analyze-signal] Calling Gemini (body: ${!!articleBody}, content: ${contentForAnalysis.length} chars, context items: ${contextSize})`)

    const prompt = buildAnalysisPrompt(contentForAnalysis, channelContext, locale, context)

    const { text } = await callGemini(prompt, {
      model: 'gemini-2.5-flash-lite',
      maxOutputTokens: 3500,
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

// ── Event-driven context loader ──────────────────────────────────────────────

async function loadAnalysisContext(
  db: ReturnType<typeof createAdminClient>,
  signal: Record<string, any>,
  signalId: string,
): Promise<AnalysisContext> {
  const context: AnalysisContext = {}

  // Extract the event from the joined FK
  const evRaw = signal.forecast_events
  const ev = Array.isArray(evRaw) ? evRaw[0] : evRaw
  if (ev?.title) {
    context.event = { title: ev.title, description: ev.description ?? null }
  }

  try {
    const [recentSignalsRes, siblingQuestionsRes, linkedMarketsRes] = await Promise.all([
      // Recent signals in the same channel
      signal.channel_id
        ? db.from('forecast_signal_feed')
            .select('title, summary')
            .eq('channel_id', signal.channel_id)
            .neq('id', signalId)
            .order('created_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: null }),

      // Open questions on the same event
      signal.event_id
        ? db.from('forecast_questions')
            .select('title, blended_probability, status, close_date')
            .eq('event_id', signal.event_id)
            .in('status', ['open', 'closed'])
            .order('created_at', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: null }),

      // Prediction markets linked to the question
      signal.question_id
        ? db.from('external_market_question_links')
            .select('match_confidence, external_markets(title, last_probability, status, volume)')
            .eq('question_id', signal.question_id)
            .eq('status', 'confirmed')
            .limit(5)
        : Promise.resolve({ data: null }),
    ])

    if (recentSignalsRes.data?.length) {
      context.recentSignals = recentSignalsRes.data.map((r: any) => ({
        title: r.title,
        summary: r.summary,
      }))
    }

    if (siblingQuestionsRes.data?.length) {
      context.questions = siblingQuestionsRes.data.map((q: any) => ({
        title: q.title,
        blended_probability: q.blended_probability,
        status: q.status,
        close_date: q.close_date,
      }))
    }

    if (linkedMarketsRes.data?.length) {
      context.markets = linkedMarketsRes.data
        .filter((m: any) => m.external_markets)
        .map((m: any) => {
          const mkt = Array.isArray(m.external_markets) ? m.external_markets[0] : m.external_markets
          return {
            title: mkt?.title ?? '',
            probability: mkt?.last_probability ?? null,
          }
        })
        .filter((m: any) => m.title)
    }
  } catch (e) {
    console.warn('[analyze-signal] Context fetch partially failed (non-blocking):', e instanceof Error ? e.message : e)
  }

  return context
}

// ── Prompt builder with event-driven context ─────────────────────────────────

function buildAnalysisPrompt(
  content: string,
  channelContext: string,
  locale: string,
  context: AnalysisContext,
): string {
  const lang = locale === 'fr' ? 'français' : 'English'
  const isFr = locale === 'fr'

  const sections: string[] = [
    `Analyste économique senior. ${channelContext}`,
    ``,
    `--- ARTICLE ---`,
    content,
  ]

  // Event context
  if (context.event) {
    sections.push(
      ``,
      `--- ${isFr ? 'CONTEXTE ÉVÉNEMENT' : 'EVENT CONTEXT'} ---`,
      `${isFr ? 'Cet article fait partie de l\'événement' : 'This article is part of the event'} : "${context.event.title}"`,
    )
    if (context.event.description) {
      sections.push(`Description : ${context.event.description.slice(0, 300)}`)
    }
  }

  // Sibling questions on the same event
  if (context.questions?.length) {
    sections.push(
      ``,
      `--- ${isFr ? 'QUESTIONS DE PRÉVISION OUVERTES SUR CET ÉVÉNEMENT' : 'OPEN FORECAST QUESTIONS ON THIS EVENT'} ---`,
    )
    for (const q of context.questions) {
      const prob = q.blended_probability != null ? `${Math.round(q.blended_probability * 100)}%` : '?'
      sections.push(`- "${q.title}" → ${isFr ? 'probabilité actuelle' : 'current probability'} : ${prob} (${q.status})`)
    }
  }

  // Recent signals in the same channel
  if (context.recentSignals?.length) {
    sections.push(
      ``,
      `--- ${isFr ? 'SIGNAUX RÉCENTS DANS CE CANAL' : 'RECENT SIGNALS IN THIS CHANNEL'} ---`,
    )
    for (const sig of context.recentSignals) {
      const summary = sig.summary ? ` — ${sig.summary.slice(0, 100)}` : ''
      sections.push(`- "${sig.title}"${summary}`)
    }
  }

  // Prediction markets
  if (context.markets?.length) {
    sections.push(
      ``,
      `--- ${isFr ? 'MARCHÉS DE PRÉDICTION' : 'PREDICTION MARKETS'} ---`,
    )
    for (const m of context.markets) {
      const prob = m.probability != null ? `${Math.round(m.probability * 100)}%` : '?'
      sections.push(`- "${m.title}" → ${prob}`)
    }
  }

  // Instructions
  const hasContext = context.event || context.questions?.length || context.recentSignals?.length || context.markets?.length
  const contextInstruction = hasContext
    ? (isFr
        ? `IMPORTANT : Situe cet article dans la DYNAMIQUE GLOBALE de l'événement et des signaux récents. L'analyse ne doit PAS être isolée — elle doit montrer comment cet article s'inscrit dans l'évolution du sujet, les tendances observées, et l'impact sur les questions de prévision listées ci-dessus.`
        : `IMPORTANT: Situate this article within the BROADER DYNAMICS of the event and recent signals. The analysis must NOT be isolated — it should show how this article fits into the subject's evolution, observed trends, and impact on the forecast questions listed above.`)
    : ''

  const relatedForecastsInstruction = context.questions?.length
    ? (isFr
        ? `Pour "relatedForecasts", identifie parmi les questions listées ci-dessus celles qui sont les PLUS IMPACTÉES par cet article. Retourne leur titre exact, la probabilité actuelle, et une phrase décrivant l'impact.`
        : `For "relatedForecasts", identify which of the questions listed above are MOST IMPACTED by this article. Return their exact title, current probability, and a sentence describing the impact.`)
    : ''

  sections.push(
    ``,
    `--- INSTRUCTION ---`,
    `${isFr ? 'Analyse en français' : 'Analysis in English'}. ${contextInstruction}`,
    relatedForecastsInstruction,
    ``,
    `${isFr ? 'Retourne UNIQUEMENT du JSON valide sans markdown' : 'Return ONLY valid JSON without markdown'} :`,
    `{"executiveTakeaway":"2-3 phrases","whyThisMatters":["point1","point2"],"immediateImplications":["impact1","impact2"],"secondOrderEffects":["effet1","effet2"],"regionalImplications":[{"region":"Nom","implications":["impl1"]}],"sectorExposure":[{"sector":"Nom","riskLevel":"high","notes":["note1"]}],"whatToWatch":["item1","item2"],"confidenceNote":"note","relatedForecasts":[{"title":"Question exacte","probability":0.62,"impact":"Description de l'impact"}]}`,
  )

  return sections.filter(Boolean).join('\n')
}
