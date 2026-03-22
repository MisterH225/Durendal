import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, accounts(*, plans(*))')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-100">
      {/* Sidebar desktop */}
      <Sidebar profile={profile} />

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar profile={profile} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
