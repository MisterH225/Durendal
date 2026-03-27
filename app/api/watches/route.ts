import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    // Client utilisateur (avec RLS) — authentification
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
    const { name, description, sectors, countries, companies = [], frequency = 'daily', is_shared = false } = body

    if (!name?.trim())        return NextResponse.json({ error: 'Le nom est requis' },          { status: 400 })
    if (!sectors?.length)     return NextResponse.json({ error: 'Au moins un secteur requis' }, { status: 400 })
    if (!countries?.length)   return NextResponse.json({ error: 'Au moins un pays requis' },    { status: 400 })

    // ── Créer la veille (client user, couvert par les policies watches) ──
    const { data: watch, error: watchError } = await supabase
      .from('watches')
      .insert({
        account_id:  profile.account_id,
        created_by:  user.id,
        name:        name.trim(),
        description: description?.trim() || null,
        sectors,
        countries,
        frequency,
        is_active:   true,
        is_shared,
      })
      .select()
      .single()

    if (watchError) throw watchError

    // ── Créer et lier les entreprises (client admin → contourne le RLS) ──
    // Nécessaire car companies + watch_companies peuvent bloquer l'anon key.
    const admin = createAdminClient()
    const linked: string[] = []
    const errors: string[] = []

    for (const co of companies) {
      if (!co.name?.trim()) continue
      try {
        // Chercher si l'entreprise existe déjà
        const { data: existing } = await admin
          .from('companies')
          .select('id')
          .ilike('name', co.name.trim())   // ilike = insensible à la casse
          .limit(1)
          .maybeSingle()

        let companyId: string | null = existing?.id ?? null

        if (!companyId) {
          const { data: newCo, error: coErr } = await admin
            .from('companies')
            .insert({
              name:      co.name.trim(),
              country:   co.country  || countries[0],
              sector:    co.sector   || sectors[0],
              is_global: true,
              logo_url:  co.logo_url || null,
            })
            .select('id')
            .single()

          if (coErr) { errors.push(`insert company "${co.name}": ${coErr.message}`); continue }
          companyId = newCo?.id ?? null
        }

        if (companyId) {
          const { error: wcErr } = await admin
            .from('watch_companies')
            .upsert(
              { watch_id: watch.id, company_id: companyId, aspects: co.aspects ?? [] },
              { onConflict: 'watch_id,company_id' },
            )

          if (wcErr) errors.push(`link company "${co.name}": ${wcErr.message}`)
          else linked.push(co.name.trim())
        }
      } catch (e: any) {
        errors.push(`${co.name}: ${e?.message}`)
      }
    }

    if (errors.length > 0) {
      console.warn('[API/watches POST] Avertissements entreprises:', errors)
    }

    return NextResponse.json({
      success:        true,
      watch,
      linked_companies: linked.length,
      warnings:       errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[API/watches POST]', error?.message)
    return NextResponse.json({ error: error?.message || 'Erreur serveur' }, { status: 500 })
  }
}
