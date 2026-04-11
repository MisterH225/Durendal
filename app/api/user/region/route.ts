import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectRegionFromHeaders, REGION_LABELS, type RegionCode } from '@/lib/geo/detect-region'

const VALID_REGIONS = new Set<string>(Object.keys(REGION_LABELS))

export async function GET() {
  const detected = detectRegionFromHeaders()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let userRegion: string | null = null
  if (user) {
    const db = createAdminClient()
    const { data: profile } = await db.from('profiles').select('region').eq('id', user.id).single()
    userRegion = profile?.region ?? null
  }

  return NextResponse.json({
    detected,
    saved: userRegion,
    effective: userRegion ?? detected,
    labels: REGION_LABELS,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { region } = await req.json()
  if (!region || !VALID_REGIONS.has(region)) {
    return NextResponse.json({ error: `Région invalide. Valides : ${[...VALID_REGIONS].join(', ')}` }, { status: 400 })
  }

  const db = createAdminClient()
  const { error } = await db
    .from('profiles')
    .update({ region: region as RegionCode })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, region })
}
