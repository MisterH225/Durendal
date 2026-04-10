import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishForecastEvent } from '@/lib/forecast/queue/publisher'
import type { AIForecastRequestedPayload } from '@/packages/contracts/src'

async function assertSuperadmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p?.role === 'superadmin' ? user : null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await assertSuperadmin()) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const force = body?.force === true
  const db = createAdminClient()
  const { data: question, error } = await db.from('forecast_questions').select('id, status, forecast_channels ( slug )').eq('id', params.id).single()
  if (error || !question) return NextResponse.json({ error: 'Question introuvable' }, { status: 404 })
  if (['resolved_yes', 'resolved_no', 'annulled'].includes(question.status) && !force)
    return NextResponse.json({ error: 'Question déjà résolue. Utilisez force=true pour forcer.' }, { status: 409 })
  const channelSlug = (question as any).forecast_channels?.slug ?? 'unknown'
  const eventPayload: AIForecastRequestedPayload = { questionId: params.id, channelSlug, requestedBy: 'admin', force }
  await publishForecastEvent<Record<string, unknown>>({ type: 'forecast.ai.forecast.requested', correlationId: params.id, payload: eventPayload as unknown as Record<string, unknown> })
  return NextResponse.json({ ok: true, queued: true, payload: eventPayload })
}
