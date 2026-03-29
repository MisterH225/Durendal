export const maxDuration = 300

/**
 * POST /api/opportunities/run-pipeline
 * Déclenche le pipeline complet : discovery → fetch → extract → qualify.
 *
 * Body: { watchId: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runFullPipeline } from '@/lib/opportunities/pipeline'

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
    const watchId = body.watchId
    if (!watchId) return NextResponse.json({ error: 'watchId requis' }, { status: 400 })

    // Verify watch ownership
    const { data: watch } = await supabase
      .from('watches')
      .select('id, account_id')
      .eq('id', watchId)
      .eq('account_id', profile.account_id)
      .single()

    if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

    const admin = createAdminClient()
    const result = await runFullPipeline(admin, watchId)

    return NextResponse.json({
      success: result.status !== 'failed',
      ...result,
    })
  } catch (e: any) {
    console.error('[run-pipeline] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
