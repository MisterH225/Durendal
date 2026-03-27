import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runSourceCategorizer, findExistingSourceByUrl } from '@/lib/agents/source-categorizer'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const db = createAdminClient()

  // Vérification de doublon avant insertion
  if (body.url) {
    const existing = await findExistingSourceByUrl(db, body.url)
    if (existing) {
      return NextResponse.json({
        error: `Ce site existe déjà : "${existing.name}" (${existing.url})`,
        duplicate: existing,
      }, { status: 409 })
    }
  }

  const { error, data } = await db.from('sources').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Déclenche automatiquement l'agent catégoriseur pour la nouvelle source
  if (data?.id) {
    runSourceCategorizer(db, {
      sourceIds: [data.id],
      trigger: 'auto_insert',
    }).catch(() => {})
  }

  return NextResponse.json({ source: data })
}
