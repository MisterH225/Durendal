import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BarChart2, Eye, FileText, Zap, Bot, TrendingUp, Clock, CheckCircle2, AlertCircle, XCircle, Activity } from 'lucide-react'
import Link from 'next/link'

// Statut d'un agent IA basé sur les derniers agent_jobs
const AGENT_DEFS = [
  { num: 1, name: 'Collecteur Gemini',       minPlan: 'free' },
  { num: 2, name: 'Rapport de synthèse',     minPlan: 'free' },
  { num: 3, name: 'Analyse de marché',       minPlan: 'pro' },
  { num: 4, name: 'Recommandations stratégiques', minPlan: 'business' },
]

const PLAN_ORDER: Record<string, number> = { free: 0, pro: 1, business: 2 }

function planIncludes(planName: string, minPlan: string) {
  return (PLAN_ORDER[planName] ?? 0) >= (PLAN_ORDER[minPlan] ?? 0)
}

function AgentStatusIcon({ status }: { status: string | null }) {
  if (status === 'running') return <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0 mt-1.5" />
  if (status === 'done')    return <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
  if (status === 'failed')  return <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
  return <div className="w-2 h-2 rounded-full bg-neutral-300 flex-shrink-0 mt-1.5" />
}

function agentStatusLabel(status: string | null, completedAt: string | null, errorMsg: string | null, signalsCount: number | null): string {
  if (status === 'running') return 'En cours d\'exécution...'
  if (status === 'done') {
    const when = completedAt ? new Date(completedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
    const count = signalsCount ? ` · ${signalsCount} signaux` : ''
    return `Terminé${count}${when ? ` — ${when}` : ''}`
  }
  if (status === 'failed') return `Échec${errorMsg ? ` : ${errorMsg.slice(0, 60)}` : ''}`
  if (status === 'pending') return 'En attente...'
  return 'Jamais exécuté'
}

function agentProgressColor(status: string | null) {
  if (status === 'running') return 'bg-green-500'
  if (status === 'done')    return 'bg-blue-600'
  if (status === 'failed')  return 'bg-red-400'
  return 'bg-neutral-200'
}

function agentProgress(status: string | null) {
  if (status === 'running') return 60
  if (status === 'done')    return 100
  if (status === 'failed')  return 30
  return 0
}

export default async function DashboardPage() {
  const supabase = createClient()
  let user: any = null
  let profile: any = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch { /* session manquante — le layout gère déjà la redirection */ }

  if (!user) return null

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*, accounts(*, plans(*))')
    .eq('id', user.id)
    .single()
  profile = profileData

  const plan = profile?.accounts?.plans
  const planName = plan?.name || 'free'

  // ── Veilles actives ──────────────────────────────────────────────────────
  const { data: watches } = await supabase
    .from('watches')
    .select('id, name, sectors, countries')
    .eq('account_id', profile?.account_id)
    .eq('is_active', true)

  const watchIds = (watches || []).map((w: any) => w.id)

  // ── Métriques réelles ────────────────────────────────────────────────────
  // Nombre de signaux total
  const { count: signalsTotal } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .in('watch_id', watchIds.length > 0 ? watchIds : ['00000000-0000-0000-0000-000000000000'])

  // Signaux cette semaine
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { count: signalsWeek } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .in('watch_id', watchIds.length > 0 ? watchIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('collected_at', weekAgo)

  // Alertes non lues
  const { count: unreadAlerts } = await supabase
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', profile?.account_id)
    .eq('is_read', false)

  // Alertes total actives (non lues ou récentes)
  const { count: totalAlerts } = await supabase
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', profile?.account_id)

  // Entreprises suivies (via watch_companies)
  const { count: companiesCount } = await supabase
    .from('watch_companies')
    .select('*', { count: 'exact', head: true })
    .in('watch_id', watchIds.length > 0 ? watchIds : ['00000000-0000-0000-0000-000000000000'])

  // Rapports générés ce mois
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
  const { count: reportsMonth } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', profile?.account_id)
    .gte('generated_at', monthAgo)

  // ── Derniers signaux ─────────────────────────────────────────────────────
  const { data: signals } = watchIds.length > 0
    ? await supabase
        .from('signals')
        .select('id, title, raw_content, url, source_name, collected_at, companies(name)')
        .in('watch_id', watchIds)
        .order('collected_at', { ascending: false })
        .limit(5)
    : { data: [] }

  // ── État des agents IA (derniers jobs par numéro d'agent) ────────────────
  const { data: agentJobs } = watchIds.length > 0
    ? await supabase
        .from('agent_jobs')
        .select('agent_number, status, started_at, completed_at, error_message, signals_count')
        .in('watch_id', watchIds)
        .order('created_at', { ascending: false })
        .limit(50)
    : { data: [] }

  // Garder seulement le job le plus récent par agent_number
  const latestJobByAgent: Record<number, any> = {}
  for (const job of (agentJobs || [])) {
    if (!latestJobByAgent[job.agent_number]) {
      latestJobByAgent[job.agent_number] = job
    }
  }

  // ── Signaux forecast récents ─────────────────────────────────────────────
  const adminDb = createAdminClient()
  const { data: forecastSignals } = await adminDb
    .from('forecast_signal_feed')
    .select('id, signal_type, title, summary, severity, created_at, forecast_questions(slug, title), forecast_channels(name, slug)')
    .order('created_at', { ascending: false })
    .limit(4)

  const firstName = profile?.full_name?.split(' ')[0] || 'vous'
  const isNew = (watches || []).length === 0

  return (
    <div className="max-w-6xl mx-auto pb-24 lg:pb-6">

      {/* Welcome banner */}
      <div className="bg-blue-700 rounded-xl p-4 mb-6 text-white flex items-center justify-between">
        <div>
          <div className="font-semibold text-base mb-0.5">Bienvenue, {firstName} 👋</div>
          <div className="text-sm text-blue-200">
            {isNew
              ? 'Créez votre première veille pour démarrer.'
              : `${watches?.length} veille${(watches?.length || 0) > 1 ? 's' : ''} active${(watches?.length || 0) > 1 ? 's' : ''} · agents IA disponibles sur votre plan ${plan?.display_name || 'Free'}.`
            }
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full border
            ${planName === 'business' ? 'bg-purple-100 text-purple-800 border-purple-200' :
              planName === 'pro' ? 'bg-blue-100 text-blue-800 border-blue-200' :
              'bg-neutral-100 text-neutral-700 border-neutral-200'}`}>
            {plan?.display_name || 'Free'}
          </span>
          {isNew && (
            <Link href="/veilles" className="bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
              + Créer une veille
            </Link>
          )}
        </div>
      </div>

      {/* Métriques réelles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="metric-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-500 font-medium">Entreprises suivies</span>
            <Eye size={14} className="text-blue-700" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tracking-tight">{companiesCount ?? 0}</div>
          <div className="text-xs text-neutral-400 font-medium mt-1">
            {(watches?.length || 0)} veille{(watches?.length || 0) > 1 ? 's' : ''} active{(watches?.length || 0) > 1 ? 's' : ''}
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-500 font-medium">Signaux collectés</span>
            <BarChart2 size={14} className="text-green-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tracking-tight">{signalsTotal ?? 0}</div>
          <div className="text-xs text-green-600 font-medium mt-1">
            {signalsWeek ? `+${signalsWeek} cette semaine` : 'Aucun cette semaine'}
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-500 font-medium">Alertes</span>
            <Zap size={14} className="text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tracking-tight">{totalAlerts ?? 0}</div>
          <div className={`text-xs font-medium mt-1 ${(unreadAlerts ?? 0) > 0 ? 'text-amber-600' : 'text-neutral-400'}`}>
            {(unreadAlerts ?? 0) > 0 ? `${unreadAlerts} non lue${(unreadAlerts ?? 0) > 1 ? 's' : ''}` : 'Tout lu'}
          </div>
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-neutral-500 font-medium">Rapports ce mois</span>
            <FileText size={14} className="text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 tracking-tight">{reportsMonth ?? 0}</div>
          <div className="text-xs text-neutral-400 font-medium mt-1">
            Max : {plan?.max_reports_per_month ?? 2}/mois
          </div>
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Derniers signaux */}
        <div className="card-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-neutral-900">Derniers signaux</h2>
            {(signalsTotal ?? 0) > 0 && <span className="badge badge-blue">Live</span>}
          </div>
          {signals && signals.length > 0 ? (
            <div className="space-y-3">
              {signals.map((s: any) => (
                <div key={s.id} className="pb-3 border-b border-neutral-100 last:border-0 last:pb-0">
                  <div className="text-[10px] text-neutral-400 mb-1 flex items-center gap-1.5">
                    {(s.source_name || (s.url ? (() => { try { return new URL(s.url).hostname } catch { return null } })() : null)) && (
                      <span>{s.source_name || new URL(s.url).hostname}</span>
                    )}
                    <span>·</span>
                    <span>{new Date(s.collected_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-xs text-neutral-700 leading-relaxed line-clamp-2 font-medium">
                    {s.title || s.raw_content?.slice(0, 120)}
                  </div>
                  {s.companies?.name && (
                    <div className="text-[11px] text-blue-700 font-medium mt-1">{s.companies.name}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FileText size={28} className="text-neutral-300" />}
              text={isNew ? "Créez une veille pour démarrer la collecte." : "Aucun signal collecté. Lancez un scan Gemini."}
              action={
                isNew
                  ? <Link href="/veilles" className="text-xs text-blue-700 font-medium hover:underline">Créer une veille →</Link>
                  : <Link href="/agents" className="text-xs text-blue-700 font-medium hover:underline">Lancer un scan →</Link>
              }
            />
          )}
        </div>

        {/* État réel des agents IA */}
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-4">État des agents IA</h2>
          <div className="space-y-4">
            {AGENT_DEFS.map(({ num, name, minPlan }) => {
              const included = planIncludes(planName, minPlan)
              const job = latestJobByAgent[num]
              const status = job?.status ?? null
              const progress = agentProgress(status)
              const label = agentStatusLabel(status, job?.completed_at, job?.error_message, job?.signals_count)
              const progressColor = agentProgressColor(status)

              return (
                <div key={num} className="flex items-start gap-3">
                  <AgentStatusIcon status={included ? status : null} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-neutral-800">{name}</span>
                      {!included && (
                        <span className="badge badge-gray text-[10px]">Non inclus</span>
                      )}
                      {included && status === 'running' && (
                        <span className="badge badge-green text-[10px]">En cours</span>
                      )}
                      {included && status === 'failed' && (
                        <span className="badge badge-red text-[10px]">Échec</span>
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 mb-1.5">
                      {included ? label : `Disponible à partir du plan ${minPlan === 'pro' ? 'Pro' : 'Business'}`}
                    </div>
                    {included && progress > 0 && (
                      <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Upgrade prompt si Free */}
          {planName === 'free' && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-xs font-semibold text-blue-800 mb-1">Débloquez tous les agents IA</div>
              <div className="text-xs text-blue-700 mb-2">Agents 3 et 4 disponibles à partir du plan Pro.</div>
              <Link href="/forfait" className="text-xs font-bold text-blue-700 hover:underline">Voir les plans →</Link>
            </div>
          )}

          {/* CTA si aucun job lancé et veilles présentes */}
          {!isNew && Object.keys(latestJobByAgent).length === 0 && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <div className="text-xs font-semibold text-amber-800 mb-1">Aucun scan lancé</div>
              <div className="text-xs text-amber-700 mb-2">
                Le collecteur Gemini n'a pas encore été exécuté sur vos veilles.
              </div>
              <Link href="/agents" className="text-xs font-bold text-amber-700 hover:underline">
                Lancer un scan →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Signaux forecast ─────────────────────────────────────────────────── */}
      {(forecastSignals ?? []).length > 0 && (
        <div className="card-lg mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
              <Activity size={14} className="text-violet-600" />
              Signaux forecast marché
            </h2>
            <Link href="/forecast" className="text-xs text-violet-700 font-medium hover:underline">
              Explorer →
            </Link>
          </div>
          <div className="space-y-3">
            {(forecastSignals ?? []).map((s: any) => {
              const isResolution    = s.signal_type === 'resolution'
              const isProbShift     = s.signal_type === 'probability_shift'
              const severityColor   = s.severity === 'high' ? 'text-red-600' : s.severity === 'medium' ? 'text-amber-600' : 'text-green-600'
              const badge = isResolution ? '🔚 Résolu' : isProbShift ? '📊 Glissement' : '📡 Signal'
              const qSlug = s.forecast_questions?.slug ?? s.forecast_questions?.id
              return (
                <div key={s.id} className="flex items-start gap-3 pb-3 border-b border-neutral-100 last:border-0 last:pb-0">
                  <div className="flex-shrink-0 mt-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700`}>{badge}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {qSlug ? (
                      <Link href={`/forecast/q/${qSlug}`} className="text-xs font-semibold text-neutral-800 hover:text-violet-700 line-clamp-1">
                        {s.title}
                      </Link>
                    ) : (
                      <div className="text-xs font-semibold text-neutral-800 line-clamp-1">{s.title}</div>
                    )}
                    {s.summary && (
                      <div className="text-[11px] text-neutral-500 line-clamp-1 mt-0.5">{s.summary}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-[10px] text-neutral-400 whitespace-nowrap">
                    {new Date(s.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick actions si nouveau */}
      {isNew && (
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-4">Démarrez en 3 étapes</h2>
          <div className="space-y-2">
            {[
              { done: true,  icon: '✅', title: 'Compte créé',              desc: 'Email vérifié avec succès',                    href: null },
              { done: false, icon: '👁',  title: 'Créez votre première veille', desc: 'Choisissez secteur, pays, concurrents',     href: '/veilles' },
              { done: false, icon: '💳', title: 'Activez votre forfait',     desc: '14 jours gratuits, sans carte bancaire',       href: '/forfait' },
            ].map(({ done, icon, title, desc, href }) => {
              const inner = (
                <>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0
                    ${done ? 'bg-green-100' : 'bg-blue-100'}`}>
                    {icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-neutral-900">{title}</div>
                    <div className="text-[11px] text-neutral-500">{desc}</div>
                  </div>
                  {done ? <span className="text-green-600 text-sm font-bold">✓</span> : <span className="text-neutral-300 text-sm">→</span>}
                </>
              )
              const cls = `flex items-center gap-3 p-3 rounded-lg border transition-all ${done ? 'border-green-200 bg-green-50' : 'border-neutral-200 hover:border-blue-200 hover:bg-blue-50'}`
              return href
                ? <Link key={title} href={href} className={cls}>{inner}</Link>
                : <div key={title} className={cls}>{inner}</div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon, text, action }: { icon: React.ReactNode; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-xs text-neutral-500 mb-2">{text}</p>
      {action}
    </div>
  )
}
