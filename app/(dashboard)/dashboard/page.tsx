import { createClient } from '@/lib/supabase/server'
import { BarChart2, Eye, FileText, Zap, Bot, TrendingUp } from 'lucide-react'
import Link from 'next/link'

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

  const { data: watches } = await supabase
    .from('watches')
    .select('*')
    .eq('account_id', profile?.account_id)
    .eq('is_active', true)

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('account_id', profile?.account_id)
    .order('generated_at', { ascending: false })
    .limit(5)

  const { data: signals } = await supabase
    .from('signals')
    .select('*, companies(name), sources(name)')
    .in('watch_id', (watches || []).map((w: any) => w.id))
    .order('collected_at', { ascending: false })
    .limit(5)

  const firstName = profile?.full_name?.split(' ')[0] || 'vous'
  const plan = profile?.accounts?.plans
  const isNew = (watches || []).length === 0

  return (
    <div className="max-w-6xl mx-auto pb-20 lg:pb-0">

      {/* Welcome banner */}
      <div className="bg-blue-700 rounded-xl p-4 mb-6 text-white flex items-center justify-between">
        <div>
          <div className="font-semibold text-base mb-0.5">Bienvenue, {firstName} 👋</div>
          <div className="text-sm text-blue-200">
            {isNew
              ? 'Créez votre première veille pour démarrer.'
              : `${watches?.length} veille${(watches?.length || 0) > 1 ? 's' : ''} active${(watches?.length || 0) > 1 ? 's' : ''} · agents IA en cours d'analyse.`
            }
          </div>
        </div>
        {isNew && (
          <Link href="/veilles" className="bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0 ml-4">
            + Créer une veille
          </Link>
        )}
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Entreprises suivies', value: '12', delta: '+2 ce mois', icon: Eye, color: 'text-blue-700' },
          { label: 'Insights collectés', value: '847', delta: '+134 cette semaine', icon: BarChart2, color: 'text-green-600' },
          { label: 'Alertes actives', value: '5', delta: '3 non lues', icon: Zap, color: 'text-amber-600' },
          { label: 'Score opportunité', value: '78', delta: '+6 pts ce mois', icon: TrendingUp, color: 'text-purple-600' },
        ].map(({ label, value, delta, icon: Icon, color }) => (
          <div key={label} className="metric-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-neutral-500 font-medium">{label}</span>
              <Icon size={14} className={color} />
            </div>
            <div className="text-2xl font-bold text-neutral-900 tracking-tight">{value}</div>
            <div className="text-xs text-green-600 font-medium mt-1">{delta}</div>
          </div>
        ))}
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

        {/* Derniers insights */}
        <div className="card-lg">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-neutral-900">Derniers insights</h2>
            <span className="badge badge-blue">Live</span>
          </div>
          {signals && signals.length > 0 ? (
            <div className="space-y-3">
              {signals.map((s: any) => (
                <div key={s.id} className="pb-3 border-b border-neutral-100 last:border-0 last:pb-0">
                  <div className="text-[10px] text-neutral-400 mb-1">
                    {s.sources?.name} · {new Date(s.collected_at).toLocaleDateString('fr-FR')}
                  </div>
                  <div className="text-xs text-neutral-600 leading-relaxed line-clamp-2">
                    {s.title || s.raw_content?.slice(0, 120) + '...'}
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
              text="Aucun signal collecté pour l'instant."
              action={<Link href="/veilles" className="text-xs text-blue-700 font-medium hover:underline">Créer une veille →</Link>}
            />
          )}
        </div>

        {/* État agents IA */}
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-4">État des agents IA</h2>
          <div className="space-y-3">
            {[
              { num: 1, name: 'Agent collecte', status: 'Scan actif · 34 sources', progress: 72, color: 'bg-green-500', dot: 'bg-green-500', active: true },
              { num: 2, name: 'Agent synthèse', status: 'Traitement de 847 signaux...', progress: 45, color: 'bg-amber-500', dot: 'bg-amber-500', active: true },
              { num: 3, name: 'Agent analyse marché', status: '3 opportunités identifiées', progress: 90, color: 'bg-blue-600', dot: 'bg-blue-600', active: plan?.agents_enabled?.includes(3) },
              { num: 4, name: 'Agent stratégie', status: 'En attente', progress: 0, color: 'bg-neutral-300', dot: 'bg-neutral-300', active: plan?.agents_enabled?.includes(4) },
            ].map(({ num, name, status, progress, color, dot, active }) => (
              <div key={num} className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-neutral-800">{name}</span>
                    {!active && <span className="badge badge-gray text-[10px]">Non inclus</span>}
                  </div>
                  <div className="text-[11px] text-neutral-500 mb-1.5">{status}</div>
                  {progress > 0 && (
                    <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Upgrade prompt si Free */}
          {plan?.name === 'free' && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-xs font-semibold text-blue-800 mb-1">Débloquez tous les agents IA</div>
              <div className="text-xs text-blue-700 mb-2">Agents 3 et 4 disponibles à partir du plan Pro.</div>
              <Link href="/forfait" className="text-xs font-bold text-blue-700 hover:underline">Voir les plans →</Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions si nouveau */}
      {isNew && (
        <div className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-4">Démarrez en 3 étapes</h2>
          <div className="space-y-2">
            {[
              { done: true, icon: '✅', title: 'Compte créé', desc: 'Email vérifié avec succès', href: null },
              { done: false, icon: '👁', title: 'Créez votre première veille', desc: 'Choisissez secteur, pays, concurrents', href: '/veilles' },
              { done: false, icon: '💳', title: 'Activez votre forfait', desc: '14 jours gratuits, sans carte bancaire', href: '/forfait' },
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

function EmptyState({ icon, text, action }: { icon: React.ReactNode, text: string, action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3">{icon}</div>
      <p className="text-xs text-neutral-500 mb-2">{text}</p>
      {action}
    </div>
  )
}
