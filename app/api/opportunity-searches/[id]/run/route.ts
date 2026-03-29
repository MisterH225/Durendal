/**
 * POST /api/opportunity-searches/:id/run — Run the sector search pipeline
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSectorSearchPipeline } from '@/lib/opportunities/sector-search-pipeline'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('id', user.id)
      .single()
    if (!profile?.account_id) return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })

    const { data: search, error: searchErr } = await supabase
      .from('opportunity_searches')
      .select('*')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .single()

    if (searchErr || !search) {
      return NextResponse.json({ error: 'Recherche introuvable' }, { status: 404 })
    }

    if (search.status === 'running') {
      return NextResponse.json({ error: 'Recherche déjà en cours' }, { status: 409 })
    }

    const admin = createAdminClient()

    const result = await runSectorSearchPipeline(admin, {
      searchId: search.id,
      accountId: profile.account_id,
      sector: search.sector,
      subSector: search.sub_sector,
      country: search.country,
      region: search.region,
      keywords: search.keywords || [],
      opportunityTypes: search.opportunity_types || [],
      dateRangeDays: search.date_range_days || 30,
    })

    return NextResponse.json({ success: true, result })
  } catch (e: any) {
    console.error('[SectorSearch:run] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
