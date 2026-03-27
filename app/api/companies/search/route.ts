import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/companies/search?q=orange
 * Recherche d'entreprises pour la désambiguïation.
 * Utilise Clearbit Autocomplete (gratuit) pour récupérer noms + logos.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(5_000) },
    )
    if (!res.ok) return NextResponse.json({ results: [] })

    const data = await res.json()

    return NextResponse.json({
      results: (data ?? []).slice(0, 8).map((c: any) => ({
        name:     c.name ?? '',
        domain:   c.domain ?? '',
        logo_url: c.logo ?? (c.domain ? `https://logo.clearbit.com/${c.domain}` : null),
      })),
    })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
