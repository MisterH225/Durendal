/**
 * GET  /api/opportunity-searches — List user's sector searches
 * POST /api/opportunity-searches — Create a new search
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const status = url.searchParams.get('status')

    let query = supabase
      .from('opportunity_searches')
      .select('*', { count: 'exact' })
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (status) query = query.eq('status', status)

    const { data, count, error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ searches: data || [], total: count ?? 0 })
  } catch (e: any) {
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

    const body = await req.json()
    const { sector, country, subSector, keywords, opportunityTypes, dateRangeDays } = body

    if (!sector || !country) {
      return NextResponse.json({ error: 'Secteur et pays obligatoires' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('opportunity_searches')
      .insert({
        account_id: profile.account_id,
        created_by: user.id,
        mode: 'sector_based',
        sector,
        sub_sector: subSector || null,
        country,
        keywords: keywords || [],
        opportunity_types: opportunityTypes || [],
        date_range_days: dateRangeDays || 30,
        status: 'draft',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ search: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
