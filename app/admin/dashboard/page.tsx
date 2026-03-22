import { createClient } from '@/lib/supabase/server'
import { Users, FileText, TrendingUp, Zap, DollarSign, Eye } from 'lucide-react'

export default async function AdminPage() {
  const supabase = createClient()

  const [
    { count: totalUsers },
    { count: totalWatches },
    { count: totalReports },
    { count: totalSignals },
    { data: planCounts },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('watches').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }),
    supabase.from('signals').select('*', { count: 'exact', head: true }),
    supabase.from('accounts').select('plans(display_name)'),
  ])

  const planDistribution = (planCounts || []).reduce((acc: Record<string, number>, a: any) => {
    const name = a.plans?.display_name || 'Free'
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {})

  const stats = [
    { label: 'Utilisateurs totaux', value: totalUsers || 0, icon: Users, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Veilles actives', value: totalWatches || 0, icon: Eye, color: 'text-green-700', bg: 'bg-green-50' },
    { label: 'Rapports générés', value: totalReports || 0, icon: FileText, color: 'text-purple-700', bg: 'bg-purple-50' },
    { label: 'Signaux collectés', value: totalSignals || 0, icon: Zap, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'MRR estimé', value: '0€', icon: DollarSign, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Taux conversion', value: '0%', icon: TrendingUp, color: 'text-green-700', bg: 'bg-green-50' },
  ]

  return (
    <div className="max-w-5xl">
      <h2 className="text-lg font-bold text-neutral-900 mb-6">Vue globale du SaaS</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-neutral-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <div className="text-2xl font-bold text-neutral-900 tracking-tight">{value}</div>
          </div>
        ))}
      </div>

      {/* Plan distribution */}
      <div className="card-lg mb-6">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Répartition par plan</h3>
        <div className="space-y-3">
          {Object.entries(planDistribution).map(([plan, count]: [string, any]) => {
            const total = Object.values(planDistribution).reduce((a: any, b: any) => a + b, 0)
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={plan} className="flex items-center gap-3">
                <span className="text-sm text-neutral-600 w-20 flex-shrink-0">{plan}</span>
                <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-700 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-semibold text-neutral-900 w-16 text-right">{count} ({pct}%)</span>
              </div>
            )
          })}
          {Object.keys(planDistribution).length === 0 && (
            <p className="text-sm text-neutral-400">Aucun utilisateur encore.</p>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card-lg">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Actions rapides</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '+ Code promo', href: '/admin/access', color: 'btn-primary' },
            { label: '+ Profil test', href: '/admin/access', color: 'btn-primary' },
            { label: 'Ajouter source', href: '/admin/sources', color: 'btn-ghost' },
            { label: 'Voir utilisateurs', href: '/admin/users', color: 'btn-ghost' },
          ].map(({ label, href, color }) => (
            <a key={label} href={href} className={`${color} text-center text-xs py-2`}>{label}</a>
          ))}
        </div>
      </div>
    </div>
  )
}
