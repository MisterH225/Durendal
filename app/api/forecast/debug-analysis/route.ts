import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/forecast/debug-analysis?signalId=xxx
 * Diagnostic endpoint to identify why analysis generation fails.
 */
export async function GET(req: NextRequest) {
  const signalId = req.nextUrl.searchParams.get('signalId')
  const checks: Record<string, unknown> = {}

  // 1. Check env vars
  checks.env = {
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY ? `set (${process.env.GEMINI_API_KEY?.slice(0, 6)}...)` : 'MISSING',
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING',
    SUPABASE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
  }

  // 2. Check DB connection + signal
  if (signalId) {
    try {
      const db = createAdminClient()
      const { data: signal, error } = await db
        .from('forecast_signal_feed')
        .select('id, title, summary, data')
        .eq('id', signalId)
        .single()

      if (error) {
        checks.signal = { error: error.message }
      } else {
        const d = (signal.data ?? {}) as Record<string, unknown>
        checks.signal = {
          found: true,
          title: signal.title?.slice(0, 60),
          has_source_url: !!d.source_url,
          source_url: (d.source_url as string)?.slice(0, 80) ?? null,
          has_article_body: !!d.article_body,
          article_body_length: typeof d.article_body === 'string' ? d.article_body.length : 0,
          has_cached_analysis: !!d.ai_analysis,
        }
      }
    } catch (e: any) {
      checks.signal = { error: e.message }
    }
  }

  // 3. Test article extraction (quick, with timeout)
  if (signalId) {
    try {
      const db = createAdminClient()
      const { data: signal } = await db
        .from('forecast_signal_feed')
        .select('data')
        .eq('id', signalId)
        .single()

      const d = (signal?.data ?? {}) as Record<string, unknown>
      const url = d.source_url as string | null

      if (url) {
        const t0 = Date.now()
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)

        try {
          const res = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
              'Accept': 'text/html',
            },
            redirect: 'follow',
          })
          clearTimeout(timeout)
          const html = await res.text()
          checks.extraction = {
            url: url.slice(0, 80),
            status: res.status,
            html_length: html.length,
            has_article_tag: html.includes('<article'),
            has_json_ld: html.includes('application/ld+json'),
            fetch_ms: Date.now() - t0,
          }
        } catch (fetchErr: any) {
          clearTimeout(timeout)
          checks.extraction = {
            url: url.slice(0, 80),
            error: fetchErr.message,
            fetch_ms: Date.now() - t0,
          }
        }
      } else {
        checks.extraction = { error: 'no source_url' }
      }
    } catch (e: any) {
      checks.extraction = { error: e.message }
    }
  }

  // 4. Test Gemini API (minimal call)
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (apiKey) {
      const t0 = Date.now()
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with exactly: {"test":"ok"}' }] }],
            generationConfig: { maxOutputTokens: 50, temperature: 0 },
          }),
        }
      )
      const data = await res.json()
      checks.gemini = {
        status: res.status,
        ok: res.ok,
        response: data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 100) ?? 'no response',
        error: data.error?.message ?? null,
        ms: Date.now() - t0,
      }
    } else {
      checks.gemini = { error: 'GEMINI_API_KEY not set' }
    }
  } catch (e: any) {
    checks.gemini = { error: e.message }
  }

  return NextResponse.json(checks, { status: 200 })
}
