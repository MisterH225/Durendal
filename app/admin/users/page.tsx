import { createClient } from '@/lib/supabase/server'
import { Search } from 'lucide-react'

export default async function AdminUsersPage() {
  const supabase = createClient()

  const { data: users } = await supabase
    .from('profiles')
    .select('*, accounts(*, plans(display_name, name))')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">
          Utilisateurs <span className="text-neutral-400 font-normal text-base">({users?.length || 0})</span>
        </h2>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input className="input pl-8 w-56 text-sm py-2" placeholder="Rechercher..." />
        </div>
      </div>

      <div className="card-lg overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {['Utilisateur', 'Email', 'Rôle', 'Plan', 'Statut', 'Inscrit le', 'Actions'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users?.map((user: any) => {
                const plan = user.accounts?.plans
                const account = user.accounts
                return (
                  <tr key={user.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                          {user.full_name?.slice(0,2).toUpperCase() || 'ML'}
                        </div>
                        <span className="font-semibold text-neutral-900">{user.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-neutral-600">{user.email}</td>
                    <td className="py-3 px-4">
                      <span className={`badge ${
                        user.role === 'superadmin' ? 'badge-red' :
                        user.role === 'owner' ? 'badge-purple' : 'badge-gray'
                      }`}>{user.role}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${
                        plan?.name === 'business' ? 'badge-purple' :
                        plan?.name === 'pro' ? 'badge-blue' : 'badge-gray'
                      }`}>{plan?.display_name || 'Free'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${
                        account?.subscription_status === 'active' ? 'badge-green' :
                        account?.subscription_status === 'trial' ? 'badge-amber' : 'badge-gray'
                      }`}>{account?.subscription_status || 'active'}</span>
                    </td>
                    <td className="py-3 px-4 text-neutral-500">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <button className="text-[10px] px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors font-medium">
                          Voir
                        </button>
                        <button className="text-[10px] px-2 py-1 bg-neutral-100 text-neutral-600 rounded hover:bg-neutral-200 transition-colors font-medium">
                          Modifier
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {(!users || users.length === 0) && (
                <tr><td colSpan={7} className="py-10 text-center text-neutral-400">Aucun utilisateur.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
