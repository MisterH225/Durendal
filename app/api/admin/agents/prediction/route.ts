import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkMiroFishHealth, type MiroFishConfig } from '@/lib/modules/mirofish-connector'

const AGENT_ID = 'prediction_engine'

async function requireSuperAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'superadmin' ? user : null
}

export async function GET() {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const db = createAdminClient()

  const [{ data: agent }, { data: runs }, { count: totalPredictions }] = await Promise.all([
    db.from('admin_agents').select('*').eq('id', AGENT_ID).single(),
    db.from('admin_agent_runs')
      .select('*')
      .eq('agent_id', AGENT_ID)
      .order('started_at', { ascending: false })
      .limit(20),
    db.from('reports').select('*', { count: 'exact', head: true }).eq('type', 'prediction'),
  ])

  const { data: recentReports } = await db
    .from('reports')
    .select('id, title, watch_id, created_at, summary, watches(name)')
    .eq('type', 'prediction')
    .order('created_at', { ascending: false })
    .limit(10)

  const { count: predictionJobs } = await db
    .from('agent_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('agent_number', 5)

  const { count: miroFishJobs } = await db
    .from('agent_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('agent_number', 5)
    .eq('status', 'done')
    .contains('metadata', { mirofish_used: true })

  let miroFishStatus: 'connected' | 'disconnected' | 'disabled' = 'disabled'
  if (agent?.config) {
    const cfg = agent.config as Record<string, any>
    if (cfg.mirofish_enabled) {
      const mfConfig: MiroFishConfig = {
        enabled: true,
        url: cfg.mirofish_url ?? '',
        apiKey: cfg.mirofish_api_key ?? '',
      }
      miroFishStatus = await checkMiroFishHealth(mfConfig) ? 'connected' : 'disconnected'
    }
  }

  return NextResponse.json({
    agent,
    runs: runs ?? [],
    recentReports: recentReports ?? [],
    stats: {
      totalPredictions:  totalPredictions ?? 0,
      totalJobs:         predictionJobs ?? 0,
      miroFishJobs:      miroFishJobs ?? 0,
    },
    miroFishStatus,
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { watchId, reportId } = body as { watchId?: string; reportId?: string }

  if (!watchId || !reportId) {
    return NextResponse.json({ error: 'watchId et reportId requis' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: watch } = await db
    .from('watches')
    .select('*, watch_companies(aspects, companies(id, name, website, country))')
    .eq('id', watchId)
    .single()

  if (!watch) return NextResponse.json({ error: 'Veille introuvable' }, { status: 404 })

  const { generatePredictions } = await import('@/lib/agents/prediction-engine')
  const logs: string[] = []
  const result = await generatePredictions(
    db, watchId, watch, reportId, null, null,
    (msg) => { console.log(msg); logs.push(msg) },
  )

  return NextResponse.json({ ...result, logs })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const allowed = ['prompt', 'status', 'model', 'config', 'name', 'description']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const db = createAdminClient()
  const { error, data } = await db
    .from('admin_agents')
    .update(updates)
    .eq('id', AGENT_ID)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent: data })
}

export async function DELETE() {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const db = createAdminClient()
  await db.from('admin_agent_runs').delete().eq('agent_id', AGENT_ID)
  await db.from('admin_agents').delete().eq('id', AGENT_ID)

  return NextResponse.json({ ok: true })
}
