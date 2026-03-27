/**
 * GET /api/debug/search?q=BIA+group&watch=xxxx
 * Endpoint de diagnostic — teste chaque étape de la chaîne de collecte.
 * À SUPPRIMER après diagnostic (protégé par AUTH_UI_BYPASS ou superadmin check).
 */
import { NextRequest, NextResponse } from 'next/server'
import { perplexityWebSearch }        from '@/lib/ai/perplexity'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'

export const maxDuration = 60

async function firecrawlSearch(query: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) return { ok: false, reason: 'FIRECRAWL_API_KEY absent', results: [] }
  try {
    const res  = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 3 }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json()
    return { ok: res.ok, status: res.status, results: data.data ?? [], raw: data }
  } catch (e: any) {
    return { ok: false, reason: e?.message, results: [] }
  }
}

async function testGeminiExtract(snippet: string, company: string) {
  const prompt = `Extrais les informations pertinentes sur "${company}".
Contenu : ${snippet.slice(0, 2000)}
JSON : {"signals":[{"title":"...","content":"...","relevance":0.8,"type":"news"}]}
Si rien : {"signals":[]}`
  try {
    const { text } = await callGemini(prompt, { model: 'gemini-2.5-flash', maxOutputTokens: 800 })
    const parsed   = parseGeminiJson<{ signals: any[] }>(text)
    return { ok: true, rawText: text.slice(0, 500), signals: parsed?.signals ?? [] }
  } catch (e: any) {
    return { ok: false, reason: e?.message, rawText: '', signals: [] }
  }
}

export async function GET(req: NextRequest) {
  const query   = req.nextUrl.searchParams.get('q')   || 'BIA group Côte d\'Ivoire 2025'
  const company = req.nextUrl.searchParams.get('co')  || 'BIA group'

  const report: Record<string, any> = {
    query,
    company,
    env: {
      PERPLEXITY:  !!process.env.PERPLEXITY_API_KEY,
      FIRECRAWL:   !!process.env.FIRECRAWL_API_KEY,
      GEMINI:      !!process.env.GEMINI_API_KEY,
    },
    steps: {},
  }

  // ── Step 1 : Perplexity Search API ────────────────────────────────────────
  report.steps.perplexity = { status: 'skipped', reason: 'clé absente' }
  if (process.env.PERPLEXITY_API_KEY) {
    try {
      const t0  = Date.now()
      const res = await perplexityWebSearch(query, 3)
      report.steps.perplexity = {
        status:    res.length > 0 ? 'ok' : 'empty',
        count:     res.length,
        durationMs: Date.now() - t0,
        results:   res.map(r => ({
          title:   r.title,
          url:     r.url,
          snippet: r.snippet?.slice(0, 200),
          hasFullContent: !!r.fullContent,
        })),
      }
    } catch (e: any) {
      report.steps.perplexity = { status: 'error', reason: e?.message }
    }
  }

  // ── Step 2 : Firecrawl Search ─────────────────────────────────────────────
  const t1  = Date.now()
  const fc  = await firecrawlSearch(query)
  report.steps.firecrawl = {
    status:    fc.ok && fc.results.length > 0 ? 'ok' : fc.ok ? 'empty' : 'error',
    reason:    fc.reason,
    httpStatus: fc.status,
    count:     fc.results?.length ?? 0,
    durationMs: Date.now() - t1,
    results:   (fc.results ?? []).slice(0, 3).map((r: any) => ({
      title:   r.title,
      url:     r.url,
      snippet: (r.description ?? r.markdown ?? '').slice(0, 200),
    })),
  }

  // ── Step 3 : Gemini extraction (sur premier snippet disponible) ───────────
  const firstSnippet =
    (report.steps.perplexity?.results?.[0]?.snippet) ||
    (report.steps.firecrawl?.results?.[0]?.snippet)  || ''

  if (firstSnippet) {
    const t2 = Date.now()
    const ge = await testGeminiExtract(firstSnippet, company)
    report.steps.gemini_extract = {
      status:    ge.ok ? (ge.signals.length > 0 ? 'ok' : 'empty') : 'error',
      reason:    ge.reason,
      durationMs: Date.now() - t2,
      inputLen:  firstSnippet.length,
      signals:   ge.signals,
      rawText:   ge.rawText,
    }
  } else {
    report.steps.gemini_extract = { status: 'skipped', reason: 'aucun snippet disponible' }
  }

  // ── Diagnostic final ──────────────────────────────────────────────────────
  const pplxOk = report.steps.perplexity?.status === 'ok'
  const fcOk   = report.steps.firecrawl?.status  === 'ok'
  const gemOk  = report.steps.gemini_extract?.status === 'ok'

  report.diagnosis = pplxOk && gemOk  ? '✅ Pipeline complet OK — les agents devraient trouver des signaux'
    : pplxOk && !gemOk  ? '⚠️ Perplexity OK mais Gemini n\'extrait rien — seuil trop élevé ou prompt trop strict'
    : !pplxOk && fcOk && gemOk ? '⚠️ Perplexity KO, Firecrawl OK — vérifier la clé Perplexity'
    : !pplxOk && !fcOk  ? '❌ Les deux moteurs de recherche échouent — vérifier les clés API'
    : `❓ pplx=${pplxOk} fc=${fcOk} gemini=${gemOk}`

  return NextResponse.json(report, { status: 200 })
}
