import { createClient } from '@/lib/supabase/server'
import { DollarSign, TrendingUp, Users, CreditCard, AlertCircle } from 'lucide-react'

export default async function AdminBillingPage() {
  const supabase = createClient()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*, plans(name, display_name, price_monthly), profiles(full_name, email)')
    .order('created_at', { ascending: false })

  const allAccounts = accounts || []

  // Calculs MRR
  const activeAccounts  = allAccounts.filter((a: any) => a.subscription_status === 'active')
  const trialAccounts   = allAccounts.filter((a: any) => a.subscription_status === 'trial')
  const canceledAccounts = allAccounts.filter((a: any) => a.subscription_status === 'canceled')

  const mrr = activeAccounts.reduce((sum: number, a: any) => {
    return sum + (a.plans?.price_monthly || 0)
  }, 0)

  const arr = mrr * 12

  const planBreakdown = allAccounts.reduce((acc: Record<string, { count: number; revenue: number }>, a: any) => {
    const planName = a.plans?.display_name || 'Free'
    const price    = a.plans?.price_monthly || 0
    if (!acc[planName]) acc[planName] = { count: 0, revenue: 0 }
    acc[planName].count++
    if (a.subscription_status === 'active') acc[planName].revenue += price
    return acc
  }, {})

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Paiements & revenus</h2>
        <span className="text-xs text-neutral-400">Données en temps réel</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'MRR',
            value: mrr === 0 ? '0€' : `${(mrr / 100).toFixed(0)}€`,
            sub: 'Revenu mensuel récurrent',
            icon: DollarSign, color: 'text-green-700', bg: 'bg-green-50',
          },
          {
            label: 'ARR',
            value: arr === 0 ? '0€' : `${(arr / 100).toFixed(0)}€`,
            sub: 'Revenu annuel projeté',
            icon: TrendingUp, color: 'text-blue-700', bg: 'bg-blue-50',
          },
          {
            label: 'Abonnés actifs',
            value: activeAccounts.length,
            sub: `${trialAccounts.length} en essai`,
            icon: Users, color: 'text-purple-700', bg: 'bg-purple-50',
          },
          {
            label: 'Résiliations',
            value: canceledAccounts.length,
            sub: 'Comptes annulés',
            icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50',
          },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="card-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-neutral-500">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <div className="text-2xl font-bold text-neutral-900 tracking-tight">{value}</div>
            <div className="text-[11px] text-neutral-400 mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* Plan breakdown */}
      <div className="card-lg mb-6">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Revenus par plan</h3>
        <div className="space-y-3">
          {Object.entries(planBreakdown).map(([plan, data]: [string, any]) => {
            const totalRevenue = Object.values(planBreakdown).reduce((s: number, d: any) => s + d.revenue, 0)
            const pct = totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0
            return (
              <div key={plan} className="flex items-center gap-3">
                <span className="text-sm text-neutral-600 w-24 flex-shrink-0">{plan}</span>
                <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-700 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-right w-36 flex-shrink-0">
                  <span className="text-sm font-semibold text-neutral-900">{data.count} comptes</span>
                  {data.revenue > 0 && (
                    <span className="text-xs text-green-600 ml-2">+{(data.revenue / 100).toFixed(0)}€/mois</span>
                  )}
                </div>
              </div>
            )
          })}
          {Object.keys(planBreakdown).length === 0 && (
            <p className="text-sm text-neutral-400">Aucun compte enregistré.</p>
          )}
        </div>
      </div>

      {/* Accounts table */}
      <div className="card-lg overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900">Tous les comptes</h3>
          <span className="text-xs text-neutral-400">{allAccounts.length} comptes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {['Compte', 'Plan', 'Statut', 'MRR', 'Trial fin', 'Créé le'].map(h => (
                  <th key={h} className="text-left py-2.5 px-4 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allAccounts.map((account: any) => {
                const profile = Array.isArray(account.profiles) ? account.profiles[0] : account.profiles
                const plan = account.plans
                const revenue = account.subscription_status === 'active' ? plan?.price_monthly || 0 : 0

                return (
                  <tr key={account.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900">{profile?.full_name || '—'}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{profile?.email || '—'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge text-[10px] ${
                        plan?.name === 'business' ? 'badge-purple' :
                        plan?.name === 'pro'      ? 'badge-blue'   : 'badge-gray'
                      }`}>{plan?.display_name || 'Free'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge text-[10px] ${
                        account.subscription_status === 'active'   ? 'badge-green' :
                        account.subscription_status === 'trial'    ? 'badge-amber' :
                        account.subscription_status === 'canceled' ? 'badge-red'   : 'badge-gray'
                      }`}>
                        {account.subscription_status === 'active'   ? 'Actif' :
                         account.subscription_status === 'trial'    ? 'Essai' :
                         account.subscription_status === 'canceled' ? 'Annulé' : account.subscription_status || 'Actif'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-green-700">
                      {revenue > 0 ? `${(revenue / 100).toFixed(0)}€` : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="py-3 px-4 text-neutral-500">
                      {account.trial_ends_at ? new Date(account.trial_ends_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="py-3 px-4 text-neutral-500">
                      {account.created_at ? new Date(account.created_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                  </tr>
                )
              })}
              {allAccounts.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-neutral-400">Aucun compte.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-neutral-400 mt-4">
        Les montants sont en centimes dans la base. Pour intégrer Stripe ou Wave CI, connectez le webhook de paiement à votre backend.
      </p>
    </div>
  )
}
