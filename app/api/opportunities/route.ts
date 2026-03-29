/**
 * GET /api/opportunities — Liste paginée + filtres
 * POST /api/opportunities — Legacy recompute (backward compat)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeOpportunities } from '@/lib/opportunities/opportunity-engine'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', user.id)
      .single()
    if (!profile?.account_id) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })

    const url = new URL(req.url)
    const page       = parseInt(url.searchParams.get('page') || '1')
    const limit      = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100)
    const sortBy     = url.searchParams.get('sort') || 'total_score'
    const sortDir    = url.searchParams.get('dir') === 'asc' ? true : false
    const heatLevel  = url.searchParams.get('heat')
    const status     = url.searchParams.get('status')
    const minScore   = url.searchParams.get('minScore') ? parseFloat(url.searchParams.get('minScore')!) : null
    const maxScore   = url.searchParams.get('maxScore') ? parseFloat(url.searchParams.get('maxScore')!) : null
    const watchId    = url.searchParams.get('watchId')
    const sector     = url.searchParams.get('sector')
    const country    = url.searchParams.get('country')
    const search     = url.searchParams.get('q')

    let query = supabase
      .from('lead_opportunities')
      .select(`
        *,
        companies!inner(id, name, sector, country, website, logo_url, employee_range, company_type),
        watches:primary_watch_id(id, name)
      `, { count: 'exact' })
      .eq('account_id', profile.account_id)
      .neq('display_status', 'hidden')

    if (heatLevel)  query = query.eq('heat_level', heatLevel)
    if (status)     query = query.eq('status', status)
    if (minScore !== null) query = query.gte('total_score', minScore)
    if (maxScore !== null) query = query.lte('total_score', maxScore)
    if (watchId)    query = query.eq('primary_watch_id', watchId)
    if (sector)     query = query.ilike('companies.sector', `%${sector}%`)
    if (country)    query = query.ilike('companies.country', `%${country}%`)
    if (search)     query = query.or(`title.ilike.%${search}%,companies.name.ilike.%${search}%`)

    const validSorts = ['total_score', 'last_signal_at', 'created_at', 'fit_score', 'intent_score', 'recency_score', 'confidence_score']
    const sortField = validSorts.includes(sortBy) ? sortBy : 'total_score'

    query = query
      .order(sortField, { ascending: sortDir })
      .range((page - 1) * limit, page * limit - 1)

    const { data, count, error } = await query

    if (error) {
      console.error('[Opportunities] Query error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Stats rapides
    const { data: stats } = await supabase
      .from('lead_opportunities')
      .select('heat_level, status')
      .eq('account_id', profile.account_id)

    const totalOpps = stats?.length ?? 0
    const hotCount = stats?.filter(s => s.heat_level === 'hot').length ?? 0
    const warmCount = stats?.filter(s => s.heat_level === 'warm').length ?? 0
    const newCount = stats?.filter(s => s.status === 'new').length ?? 0

    return NextResponse.json({
      opportunities: data || [],
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
      stats: { total: totalOpps, hot: hotCount, warm: warmCount, new: newCount },
    })
  } catch (e: any) {
    console.error('[Opportunities] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', user.id)
      .single()
    if (!profile?.account_id) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })

    const admin = createAdminClient()
    const result = await recomputeOpportunities(admin, profile.account_id)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (e: any) {
    console.error('[Opportunities:compute] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
