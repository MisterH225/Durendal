/**
 * POST /api/watches/[id]/companies
 * Ajoute une ou plusieurs entreprises à une veille existante.
 * Body: { companies: [{ name, country?, sector?, website?, aspects? }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase/server'
import { createAdminClient }         from '@/lib/supabase/admin'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: watch } = await supabase
      .from('watches')
      .select('id, name, countries')
      .eq('id', params.id)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    const { companies = [] } = await req.json()
    if (!Array.isArray(companies) || companies.length === 0) {
      return NextResponse.json({ error: 'Au moins une entreprise requise' }, { status: 400 })
    }

    const admin = createAdminClient()
    const added: string[]  = []
    const skipped: string[] = []
    const errors: string[]  = []

    for (const co of companies) {
      const name = co.name?.trim()
      if (!name) continue

      try {
        const { data: existing } = await admin
          .from('companies')
          .select('id')
          .ilike('name', name)
          .limit(1)

        let companyId = existing?.[0]?.id

        if (!companyId) {
          const { data: newCo, error: coErr } = await admin
            .from('companies')
            .insert({
              name,
              country:   co.country || watch.countries?.[0] || null,
              sector:    co.sector || null,
              website:   co.website || null,
              logo_url:  co.logo_url || null,
            })
            .select('id')
            .single()

          if (coErr) { errors.push(`${name}: ${coErr.message}`); continue }
          companyId = newCo?.id
        }

        if (companyId) {
          const { data: existingLink } = await admin
            .from('watch_companies')
            .select('id')
            .eq('watch_id', watch.id)
            .eq('company_id', companyId)
            .limit(1)

          if (existingLink?.length) {
            skipped.push(name)
            continue
          }

          const { error: wcErr } = await admin
            .from('watch_companies')
            .insert({ watch_id: watch.id, company_id: companyId, aspects: co.aspects ?? [] })

          if (wcErr) { errors.push(`${name}: ${wcErr.message}`); continue }
          added.push(name)
        }
      } catch (e: any) {
        errors.push(`${name}: ${e.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      added,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      watch_id: watch.id,
      watch_name: watch.name,
    })
  } catch (error: any) {
    console.error('[AddCompanies] Erreur:', error)
    return NextResponse.json({ error: String(error?.message ?? error) }, { status: 500 })
  }
}
