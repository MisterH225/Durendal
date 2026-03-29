/**
 * GET /api/opportunity-searches/:id — Search detail + results count
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const { data: search, error } = await supabase
      .from('opportunity_searches')
      .select('*')
      .eq('id', id)
      .eq('account_id', profile.account_id)
      .single()

    if (error || !search) return NextResponse.json({ error: 'Recherche introuvable' }, { status: 404 })

    // Count related opportunities
    const { count: oppCount } = await supabase
      .from('lead_opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('search_id', id)

    return NextResponse.json({ search, opportunityCount: oppCount ?? 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
