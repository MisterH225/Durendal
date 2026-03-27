import { createClient } from '@/lib/supabase/server'
import UserActions from './UserActions'

export default async function AdminUsersPage() {
  const supabase = createClient()

  const [{ data: users }, { data: plans }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*, accounts(id, subscription_status, plans(id, display_name, name))')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('plans').select('id, display_name, name').eq('is_active', true).order('price_monthly'),
  ])

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">
          Utilisateurs <span className="text-neutral-400 font-normal text-base">({users?.length || 0})</span>
        </h2>
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
              <UserActions users={(users || []) as any} plans={plans || []} />
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
