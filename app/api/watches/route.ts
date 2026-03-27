import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/watches — liste les veilles de l'utilisateur connecté
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('id', user.id).single()

    if (!profile?.account_id) return NextResponse.json({ watches: [] })

    const { data: watches } = await supabase
      .from('watches')
      .select('id, name, sectors, countries, created_at')
      .eq('account_id', profile.account_id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ watches: watches ?? [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
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

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'Profil introuvable' }, { status: 404 })
    }

    const body = await req.json()
    const { name, description, sectors, countries, companies = [], frequency = 'daily' } = body

    if (!name?.trim()) return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })
    if (!sectors?.length) return NextResponse.json({ error: 'Au moins un secteur requis' }, { status: 400 })
    if (!countries?.length) return NextResponse.json({ error: 'Au moins un pays requis' }, { status: 400 })

    // Créer la veille
    const { data: watch, error: watchError } = await supabase
      .from('watches')
      .insert({
        account_id: profile.account_id,
        created_by: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        sectors,
        countries,
        frequency,
        is_active: true,
      })
      .select()
      .single()

    if (watchError) throw watchError

    // Créer et lier les entreprises
    for (const co of companies) {
      if (!co.name?.trim()) continue

      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('name', co.name.trim())
        .single()

      let companyId = existing?.id
      if (!companyId) {
        const { data: newCo } = await supabase
          .from('companies')
          .insert({
            name: co.name.trim(),
            country: co.country || countries[0],
            sector: co.sector || sectors[0],
            is_global: true,
          })
          .select('id')
          .single()
        companyId = newCo?.id
      }

      if (companyId) {
        await supabase
          .from('watch_companies')
          .insert({ watch_id: watch.id, company_id: companyId })
          .throwOnError()
      }
    }

    return NextResponse.json({ success: true, watch })
  } catch (error: any) {
    console.error('[API/watches POST]', error?.message)
    return NextResponse.json({ error: error?.message || 'Erreur serveur' }, { status: 500 })
  }
}
