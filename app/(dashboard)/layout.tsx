import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'
import SuperAdminBar from '@/components/admin/SuperAdminBar'
import { getBypassDashboardProfile, isAuthUiBypassEnabled } from '@/lib/auth/ui-bypass'

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (isAuthUiBypassEnabled()) {
    const profile = getBypassDashboardProfile()
    return (
      <div className="flex h-screen overflow-hidden bg-neutral-100">
        <Sidebar profile={profile} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Topbar profile={profile} unreadCount={0} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    )
  }

  let user: any = null
  let profile: any = null

  try {
    const supabase = createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error || !data.user) {
      redirect('/login')
    }
    user = data.user

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, accounts(*, plans(*))')
      .eq('id', user.id)
      .single()
    profile = profileData
  } catch {
    redirect('/login')
  }

  const isSuperAdmin = user?.email === SUPERADMIN_EMAIL
  const currentPlanName = profile?.accounts?.plans?.name || 'free'

  let unreadAlerts = 0
  try {
    const supabase2 = createClient()
    const { count } = await supabase2
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', profile?.account_id)
      .eq('is_read', false)
    unreadAlerts = count ?? 0
  } catch { /* silencieux */ }

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-100">
      {/* Sidebar desktop */}
      <Sidebar profile={profile} />

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar profile={profile} unreadCount={unreadAlerts} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* Barre super admin flottante (visible uniquement pour le super admin) */}
      {isSuperAdmin && <SuperAdminBar currentPlanName={currentPlanName} />}
    </div>
  )
}
