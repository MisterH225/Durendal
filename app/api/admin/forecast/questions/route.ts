import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperadmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'superadmin' ? user : null
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

export async function GET(req: NextRequest) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const db = createAdminClient()
  let query = db
    .from('forecast_questions')
    .select('id, slug, title, status, close_date, featured, created_by, forecast_count, crowd_probability, ai_probability, blended_probability, created_at, forecast_channels ( id, slug, name ), forecast_events ( id, slug, title )')
    .order('created_at', { ascending: false })
    .limit(200)
  const status = searchParams.get('status')
  if (status && status !== 'all') query = query.eq('status', status)
  const source = searchParams.get('source')
  if (source === 'ia') query = query.is('created_by', null)
  if (source === 'admin') query = query.not('created_by', 'is', null)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data })
}

export async function POST(req: NextRequest) {
  const user = await assertSuperadmin()
  if (!user) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const body = await req.json()
  const {
    event_id,
    channel_id,
    slug,
    title,
    description,
    close_date,
    resolution_source,
    resolution_criteria,
    resolution_url,
    status,
    tags,
    featured,
    new_event,
  } = body as {
    event_id?: string
    channel_id?: string
    slug?: string
    title?: string
    description?: string | null
    close_date?: string
    resolution_source?: string
    resolution_criteria?: string
    resolution_url?: string | null
    status?: string
    tags?: string[]
    featured?: boolean
    new_event?: { title: string; slug?: string; description?: string | null }
  }

  if (!channel_id || !title || !close_date) {
    return NextResponse.json({ error: 'channel_id, title et close_date requis' }, { status: 400 })
  }

  const db = createAdminClient()
  let resolvedEventId = event_id as string | undefined

  if (!resolvedEventId && new_event?.title) {
    const evSlug = slugify(new_event.slug ?? new_event.title) + '-' + crypto.randomUUID().slice(0, 8)
    const { data: ev, error: evErr } = await db
      .from('forecast_events')
      .insert({
        channel_id,
        slug: evSlug,
        title: new_event.title.slice(0, 200),
        description: new_event.description?.slice(0, 2000) ?? null,
        status: 'active',
        tags: ['manual'],
        created_by: user.id,
      })
      .select('id')
      .single()
    if (evErr || !ev) {
      return NextResponse.json({ error: evErr?.message ?? 'Création événement impossible' }, { status: 500 })
    }
    resolvedEventId = ev.id
  }

  if (!resolvedEventId) {
    return NextResponse.json({ error: 'event_id ou new_event (title) requis' }, { status: 400 })
  }

  const qSlug = (slug && String(slug).trim()) ? String(slug).trim() : slugify(title) + '-' + crypto.randomUUID().slice(0, 6)
  const resSrc =
    resolution_source?.trim() ||
    'Sources publiques vérifiables (Reuters, AFP, BBC, institutions officielles).'
  const resCrit =
    resolution_criteria?.trim() ||
    `Réponse OUI si les faits publics vérifiables confirment la réalisation de la proposition suivante avant la date de clôture : « ${title} ». Réponse NON sinon.`

  const { data, error } = await db
    .from('forecast_questions')
    .insert({
      event_id: resolvedEventId,
      channel_id,
      slug: qSlug.slice(0, 120),
      title: title.slice(0, 240),
      description: description ?? null,
      close_date,
      resolution_source: resSrc.slice(0, 500),
      resolution_criteria: resCrit.slice(0, 4000),
      resolution_url: resolution_url ?? null,
      status: status ?? 'open',
      tags: tags ?? [],
      featured: featured ?? false,
      created_by: user.id,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data }, { status: 201 })
}
