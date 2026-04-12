import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { BarChart2, Eye, FileText, Zap, Bot, Activity } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const AGENT_DEFS = [
  { num: 1, name: 'Collecteur Gemini',              minPlan: 'free' },
  { num: 2, name: 'Rapport de synthèse',            minPlan: 'free' },
  { num: 3, name: 'Analyse de marché',              minPlan: 'pro' },
  { num: 4, name: 'Recommandations stratégiques',   minPlan: 'business' },
]

const PLAN_ORDER: Record<string, number> = { free: 0, pro: 1, business: 2 }

function planIncludes(planName: string, minPlan: string) {
  return (PLAN_ORDER[planName] ?? 0) >= (PLAN_ORDER[minPlan] ?? 0)
}

function agentStatusLabel(status: string | null, completedAt: string | null, errorMsg: string | null, signalsCount: number | null): string {
  if (status === 'running') return 'En cours d\'exécution...'
  if (status === 'done' || status === 'completed') {
    const when = completedAt ? new Date(completedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
    const count = signalsCount ? ` · ${signalsCount} signaux` : ''
    return `Terminé${count}${when ? ` — ${when}` : ''}`
  }
  if (status === 'failed') return `Échec${errorMsg ? ` : ${errorMsg.slice(0, 60)}` : ''}`
  if (status === 'pending') return 'En attente...'
  return 'Jamais exécuté'
}

function statusDot(status: string | null) {
  if (status === 'running')                        return 'bg-emerald-400 animate-pulse'
  if (status === 'done' || status === 'completed') return 'bg-blue-400'
  if (status === 'failed')                         return 'bg-red-400'
  return 'bg-neutral-700'
}

function progressPct(status: string | null) {
  if (status === 'running')                        return 60
  if (status === 'done' || status === 'completed') return 100
  if (status === 'failed')                         return 30
  return 0
}

function progressColor(status: string | null) {
  if (status === 'running')                        return 'bg-emerald-500'
  if (status === 'done' || status === 'completed') return 'bg-blue-500'
  if (status === 'failed')                         return 'bg-red-500'
  return 'bg-neutral-800'
}

export default async function VeilleDashboardPage() {
  const supabase = createClient()

  let user: any = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {}
  if (!user) redirect('/login?next=/forecast/veille')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, accounts(*, plans(*))')
    .eq('id', user.id)
    .single()

  if (!profile?.account_id) redirect('/forecast/veille/onboarding')

  const plan = (profile as any)?.accounts?.plans
  const planName = plan?.name || 'free'

  const { data: watches } = await supabase
    .from('watches')
    .select('id, name, sectors, countries')
    .eq('account_id', profile.account_id)
    .eq('is_active', true)

  const watchIds = (watches || []).map((w: any) => w.id)
  const noId = ['00000000-0000-0000-0000-000000000000']

  const [
    { count: signalsTotal },
    { count: signalsWeek },
    { count: unreadAlerts },
    { count: totalAlerts },
    { count: companiesCount },
    { count: reportsMonth },
  ] = await Promise.all([
    supabase.from('signals').select('*', { count: 'exact', head: true }).in('watch_id', watchIds.length > 0 ? watchIds : noId),
    supabase.from('signals').select('*', { count: 'exact', head: true }).in('watch_id', watchIds.length > 0 ? watchIds : noId).gte('collected_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('account_id', profile.account_id).eq('is_read', false),
    supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('account_id', profile.account_id),
    supabase.from('watch_companies').select('*', { count: 'exact', head: true }).in('watch_id', watchIds.length > 0 ? watchIds : noId),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('account_id', profile.account_id).gte('generated_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])

  const { data: signals } = watchIds.length > 0
    ? await supabase.from('signals').select('id, title, raw_content, url, source_name, category, severity, collected_at, companies(name)').in('watch_id', watchIds).order('collected_at', { ascending: false }).limit(8)
    : { data: [] }

  const { data: agentJobs } = watchIds.length > 0
    ? await supabase.from('agent_jobs').select('agent_number, status, started_at, completed_at, error_message, signals_count').in('watch_id', watchIds).order('created_at', { ascending: false }).limit(50)
    : { data: [] }

  const latestJobByAgent: Record<number, any> = {}
  for (const job of (agentJobs || [])) {
    if (!latestJobByAgent[job.agent_number]) latestJobByAgent[job.agent_number] = job
  }

  const categories = [...new Set((signals ?? []).map((s: any) => s.category).filter(Boolean))]

  const firstName = profile?.full_name?.split(' ')[0] || 'vous'
  const isNew = (watches || []).length === 0

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 overflow-x-hidden">

      {/* Welcome */}
      <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-600/10 via-blue-500/5 to-transparent p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-white mb-1">Bienvenue, {firstName}</h1>
            <p className="text-xs sm:text-sm text-neutral-400">
              {isNew
                ? 'Créez votre première veille pour démarrer la collecte de signaux.'
                : `${watches?.length} veille${(watches?.length || 0) > 1 ? 's' : ''} active${(watches?.length || 0) > 1 ? 's' : ''} · Plan ${plan?.display_name || 'Free'}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              planName === 'business' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
              planName === 'pro' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
              'bg-neutral-800 text-neutral-400 border-neutral-700'
            }`}>
              {plan?.display_name || 'Free'}
            </span>
            {isNew && (
              <Link href="/forecast/veille/watches/new" className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors">
                + Créer une veille
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Entreprises suivies', value: companiesCount ?? 0, sub: `${watches?.length || 0} veille${(watches?.length || 0) > 1 ? 's' : ''}`, icon: Eye, iconColor: 'text-blue-400' },
          { label: 'Signaux collectés', value: signalsTotal ?? 0, sub: signalsWeek ? `+${signalsWeek} cette semaine` : 'Aucun cette semaine', icon: BarChart2, iconColor: 'text-emerald-400', subColor: signalsWeek ? 'text-emerald-400' : undefined },
          { label: 'Alertes', value: totalAlerts ?? 0, sub: (unreadAlerts ?? 0) > 0 ? `${unreadAlerts} non lue${(unreadAlerts ?? 0) > 1 ? 's' : ''}` : 'Tout lu', icon: Zap, iconColor: 'text-amber-400', subColor: (unreadAlerts ?? 0) > 0 ? 'text-amber-400' : undefined },
          { label: 'Rapports ce mois', value: reportsMonth ?? 0, sub: `Max : ${plan?.max_reports_per_month ?? 2}/mois`, icon: FileText, iconColor: 'text-violet-400' },
        ].map(({ label, value, sub, icon: Icon, iconColor, subColor }) => (
          <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-neutral-500 font-medium">{label}</span>
              <Icon size={14} className={iconColor} />
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
            <div className={`text-[11px] font-medium mt-1 ${subColor ?? 'text-neutral-600'}`}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Recent signals */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white">Derniers signaux</h2>
            {(signalsTotal ?? 0) > 0 && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Live</span>
            )}
          </div>

          {/* Category pills */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-4">
              {categories.slice(0, 6).map(cat => (
                <span key={cat} className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
                  {cat}
                </span>
              ))}
            </div>
          )}

          {signals && signals.length > 0 ? (
            <div className="space-y-3">
              {(signals as any[]).map((s: any) => (
                <div key={s.id} className="pb-3 border-b border-neutral-800 last:border-0 last:pb-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {s.category && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {s.category}
                      </span>
                    )}
                    {s.severity && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${
                        s.severity === 'high' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        s.severity === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {s.severity === 'high' ? 'Fort' : s.severity === 'medium' ? 'Modéré' : 'Info'}
                      </span>
                    )}
                    <span className="text-[10px] text-neutral-600 ml-auto">
                      {new Date(s.collected_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-200 leading-relaxed line-clamp-2 font-medium">
                    {s.title || s.raw_content?.slice(0, 120)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {s.companies?.name && (
                      <span className="text-[10px] text-blue-400 font-medium">{s.companies.name}</span>
                    )}
                    {s.source_name && (
                      <span className="text-[10px] text-neutral-600">via {s.source_name}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText size={28} className="text-neutral-700 mb-3" />
              <p className="text-xs text-neutral-500 mb-2">
                {isNew ? 'Créez une veille pour démarrer la collecte.' : 'Aucun signal collecté. Lancez un scan Gemini.'}
              </p>
              <Link href={isNew ? '/forecast/veille/watches/new' : '/forecast/veille/watches'} className="text-xs text-blue-400 font-medium hover:text-blue-300">
                {isNew ? 'Créer une veille →' : 'Voir mes veilles →'}
              </Link>
            </div>
          )}
        </div>

        {/* Agent status */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-1.5">
            <Bot size={14} className="text-blue-400" />
            État des agents IA
          </h2>
          <div className="space-y-4">
            {AGENT_DEFS.map(({ num, name, minPlan }) => {
              const included = planIncludes(planName, minPlan)
              const job = latestJobByAgent[num]
              const status = job?.status ?? null
              const pct = progressPct(status)
              const label = agentStatusLabel(status, job?.completed_at, job?.error_message, job?.signals_count)
              const pColor = progressColor(status)
              const dot = statusDot(included ? status : null)

              return (
                <div key={num} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-neutral-200">{name}</span>
                      {!included && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 border border-neutral-700">
                          Non inclus
                        </span>
                      )}
                      {included && status === 'running' && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          En cours
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 mb-1.5">
                      {included ? label : `Disponible à partir du plan ${minPlan === 'pro' ? 'Pro' : 'Business'}`}
                    </p>
                    {included && pct > 0 && (
                      <div className="h-1 bg-neutral-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pColor}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {planName === 'free' && (
            <div className="mt-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/15">
              <p className="text-xs font-semibold text-blue-400 mb-1">Débloquez tous les agents IA</p>
              <p className="text-[11px] text-blue-400/60 mb-2">Agents 3 et 4 disponibles à partir du plan Pro.</p>
              <Link href="/forecast/veille/onboarding" className="text-[11px] font-bold text-blue-400 hover:text-blue-300">Voir les plans →</Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions for new users */}
      {isNew && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h2 className="text-sm font-bold text-white mb-4">Démarrez en 3 étapes</h2>
          <div className="space-y-2">
            {[
              { done: true,  icon: '✅', title: 'Compte créé',              desc: 'Email vérifié avec succès',                href: null },
              { done: false, icon: '👁',  title: 'Créez votre première veille', desc: 'Choisissez secteur, pays, concurrents', href: '/forecast/veille/watches/new' },
              { done: false, icon: '💳', title: 'Activez votre forfait',     desc: '14 jours gratuits, sans carte bancaire',   href: '/forecast/veille/onboarding' },
            ].map(({ done, icon, title, desc, href }) => {
              const inner = (
                <>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${done ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
                    {icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-neutral-200">{title}</p>
                    <p className="text-[11px] text-neutral-500">{desc}</p>
                  </div>
                  {done
                    ? <span className="text-emerald-400 text-sm font-bold">✓</span>
                    : <span className="text-neutral-600 text-sm">→</span>}
                </>
              )
              const cls = `flex items-center gap-3 p-3 rounded-lg border transition-all ${done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/40'}`
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
