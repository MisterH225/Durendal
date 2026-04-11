import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function isSafeQuestionParam(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
    || /^[a-z0-9-]{1,220}$/i.test(s)
}

async function resolveQuestionId(db: ReturnType<typeof createAdminClient>, raw: string): Promise<{ id: string; status: string } | null> {
  if (!isSafeQuestionParam(raw)) return null
  const { data } = await db
    .from('forecast_questions')
    .select('id, status')
    .or(`id.eq.${raw},slug.eq.${raw}`)
    .maybeSingle()
  if (!data) return null
  return { id: data.id, status: data.status }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = createAdminClient()
  const q = await resolveQuestionId(db, params.id)
  if (!q) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 })
  if (q.status === 'draft' || q.status === 'paused') {
    return NextResponse.json({ error: 'Question non disponible' }, { status: 404 })
  }

  const { data, error } = await db
    .from('forecast_question_comments')
    .select('id, body, created_at, user_id')
    .eq('question_id', q.id)
    .order('created_at', { ascending: false })
    .limit(80)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = data ?? []
  const userIds = [...new Set(list.map((r: { user_id: string }) => r.user_id))]
  const pmap = new Map<string, { full_name: string | null; email: string | null }>()
  if (userIds.length) {
    const { data: profs } = await db.from('profiles').select('id, full_name, email').in('id', userIds)
    for (const p of profs ?? []) pmap.set((p as { id: string }).id, p as { full_name: string | null; email: string | null })
  }

  const rows = list.map((row: { id: string; body: string; created_at: string; user_id: string }) => {
    const p = pmap.get(row.user_id)
    const label = p?.full_name?.trim()
      || (typeof p?.email === 'string' ? p.email.split('@')[0] : null)
      || 'Utilisateur'
    return { id: row.id, body: row.body, created_at: row.created_at, author_label: label }
  })

  return NextResponse.json({ comments: rows })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const dbAdmin = createAdminClient()
  const q = await resolveQuestionId(dbAdmin, params.id)
  if (!q) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 })
  if (q.status !== 'open') {
    return NextResponse.json({ error: 'Les commentaires sont fermés pour cette question.' }, { status: 409 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  const text = typeof (body as any)?.body === 'string' ? (body as any).body.trim() : ''
  if (!text || text.length > 2000) {
    return NextResponse.json({ error: 'Message vide ou trop long (max 2000 caractères).' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('forecast_question_comments')
    .insert({ question_id: q.id, user_id: user.id, body: text })
    .select('id, body, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comment: data }, { status: 201 })
}
