import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const db = createAdminClient()
  const { data: profile } = await db.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'superadmin' ? user : null
}

export async function GET() {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const db = createAdminClient()
  const { data, error } = await db
    .from('forecast_region_weights')
    .select('*')
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ regions: data })
}

export async function PATCH(req: NextRequest) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { regions } = body as { regions: { id: string; weight?: number; is_active?: boolean }[] }

  if (!Array.isArray(regions) || !regions.length) {
    return NextResponse.json({ error: 'regions[] requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const errors: string[] = []

  for (const r of regions) {
    const update: Record<string, unknown> = {}
    if (typeof r.weight === 'number') update.weight = Math.max(0, Math.min(100, r.weight))
    if (typeof r.is_active === 'boolean') update.is_active = r.is_active
    if (!Object.keys(update).length) continue

    const { error } = await db
      .from('forecast_region_weights')
      .update(update)
      .eq('id', r.id)

    if (error) errors.push(`${r.id}: ${error.message}`)
  }

  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  const user = await requireSuperAdmin()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { region_code, label_fr, label_en, weight, sort_order } = body

  if (!region_code || !label_fr || !label_en) {
    return NextResponse.json({ error: 'region_code, label_fr, label_en requis' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error } = await db
    .from('forecast_region_weights')
    .insert({
      region_code: region_code.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      label_fr,
      label_en,
      weight: weight ?? 10,
      sort_order: sort_order ?? 99,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ region: data }, { status: 201 })
}
