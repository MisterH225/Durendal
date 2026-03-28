import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countryName } from '@/lib/countries'

/**
 * GET /api/marche?watchId=xxx
 *
 * Sans watchId → renvoie la liste des veilles de l'utilisateur.
 * Avec watchId → renvoie les données agrégées pour la page Analyse Marché :
 *   - signaux agrégés par entreprise et par mois
 *   - signaux clés (top relevance)
 *   - dernier rapport Agent 3 (market)
 *   - répartition des signaux par entreprise (pour pie chart)
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!account) {
    return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  }

  const watchId = req.nextUrl.searchParams.get('watchId')

  // ── Liste des veilles ──────────────────────────────────────────────
  const { data: watches } = await supabase
    .from('watches')
    .select('id, name, sectors, countries, watch_companies(companies(id, name))')
    .eq('account_id', account.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const watchList = (watches ?? []).map((w: any) => ({
    id:        w.id,
    name:      w.name,
    sectors:   w.sectors ?? [],
    countries: (w.countries ?? []).map((c: string) => countryName(c)),
    companies: (w.watch_companies ?? [])
      .map((wc: any) => wc.companies?.name)
      .filter(Boolean),
  }))

  if (!watchId) {
    return NextResponse.json({ watches: watchList })
  }

  // ── Vérifier que la veille appartient à l'utilisateur ──────────────
  const selectedWatch = watchList.find((w: any) => w.id === watchId)
  if (!selectedWatch) {
    return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })
  }

  // ── Signaux de cette veille ────────────────────────────────────────
  const { data: signals } = await supabase
    .from('signals')
    .select('id, title, raw_content, signal_type, relevance_score, source_name, url, published_at, company_id, companies(id, name)')
    .eq('watch_id', watchId)
    .order('published_at', { ascending: false })
    .limit(200)

  const allSignals = signals ?? []

  // Agrégation par entreprise et par mois (pour le line chart)
  const companyNames = new Map<string, string>()
  const monthlyMap = new Map<string, Record<string, number>>()

  for (const s of allSignals) {
    const cName = (s as any).companies?.name ?? 'Autres'
    const cId = (s as any).company_id ?? 'other'
    companyNames.set(cId, cName)

    const d = new Date(s.published_at ?? Date.now())
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, {})
    const bucket = monthlyMap.get(monthKey)!
    bucket[cName] = (bucket[cName] ?? 0) + 1
  }

  const sortedMonths = Array.from(monthlyMap.keys()).sort()
  const monthLabels = sortedMonths.map(m => {
    const [y, mo] = m.split('-')
    const dt = new Date(Number(y), Number(mo) - 1)
    return dt.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
  })

  const uniqueCompanies = Array.from(new Set(companyNames.values()))

  const activityData = sortedMonths.map((m, i) => {
    const row: Record<string, any> = { name: monthLabels[i] }
    for (const c of uniqueCompanies) {
      row[c] = monthlyMap.get(m)?.[c] ?? 0
    }
    return row
  })

  // Répartition par entreprise (pie chart)
  const signalCountByCompany: Record<string, number> = {}
  for (const s of allSignals) {
    const cName = (s as any).companies?.name ?? 'Autres'
    signalCountByCompany[cName] = (signalCountByCompany[cName] ?? 0) + 1
  }

  const pieData = Object.entries(signalCountByCompany)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }))

  // Top signaux (par relevance)
  const keySignals = [...allSignals]
    .sort((a: any, b: any) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    .slice(0, 5)
    .map((s: any) => ({
      id:        s.id,
      title:     s.title,
      content:   (s.raw_content ?? '').slice(0, 200),
      type:      s.signal_type ?? 'news',
      relevance: s.relevance_score ?? 0,
      company:   s.companies?.name ?? null,
      url:       s.url,
    }))

  // ── Dernier rapport market (Agent 3) ───────────────────────────────
  const { data: marketReports } = await supabase
    .from('reports')
    .select('id, title, summary, content, generated_at, created_at')
    .eq('watch_id', watchId)
    .eq('type', 'market')
    .order('created_at', { ascending: false })
    .limit(1)

  const latestMarketReport = marketReports?.[0] ?? null

  let aiInsight: string | null = null
  let marketShareFromReport: any[] | null = null

  if (latestMarketReport?.content) {
    const c = latestMarketReport.content
    aiInsight = c.executive_summary ?? latestMarketReport.summary ?? null

    if (c.chart_data?.market_share_pie) {
      marketShareFromReport = c.chart_data.market_share_pie.map((p: any) => ({
        name: p.label ?? p.name,
        value: p.value,
      }))
    }
  }

  return NextResponse.json({
    watches:    watchList,
    watch:      selectedWatch,
    companies:  uniqueCompanies,
    activityData,
    pieData:    marketShareFromReport ?? pieData,
    pieSource:  marketShareFromReport ? 'agent3' : 'signals',
    keySignals,
    totalSignals: allSignals.length,
    aiInsight,
    marketReport: latestMarketReport ? {
      id:    latestMarketReport.id,
      title: latestMarketReport.title,
      date:  latestMarketReport.generated_at ?? latestMarketReport.created_at,
    } : null,
  })
}
