import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Users, Package, Globe, Key, Bot, CreditCard, Settings } from 'lucide-react'

const adminNav = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Utilisateurs', icon: Users },
  { href: '/admin/plans', label: 'Plans & offres', icon: Package },
  { href: '/admin/sources', label: 'Bibliothèque sources', icon: Globe },
  { href: '/admin/access', label: 'Accès spéciaux', icon: Key },
  { href: '/admin/agents', label: 'Configuration agents', icon: Bot },
  { href: '/admin/billing', label: 'Paiements', icon: CreditCard },
  { href: '/admin/settings', label: 'Paramètres', icon: Settings },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()

  if (profile?.role !== 'superadmin') redirect('/dashboard')

  const initials = profile?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() || 'SA'

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-100">
      {/* Admin Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-blue-900 flex flex-col">
        <div className="px-4 py-4 border-b border-white/10">
          <div className="text-sm font-bold text-white tracking-tight">MarketLens</div>
          <div className="text-[10px] text-white/40 mt-0.5">Panel Admin</div>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {adminNav.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className="flex items-center gap-2.5 px-4 py-2 text-sm text-white/55 hover:bg-white/8 hover:text-white transition-all border-l-2 border-transparent hover:border-blue-400">
              <Icon size={14} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
              {initials}
            </div>
            <div>
              <div className="text-xs font-semibold text-white">{profile?.full_name}</div>
              <div className="text-[10px] text-white/40">SuperAdmin</div>
            </div>
          </div>
          <Link href="/dashboard" className="text-[10px] text-white/40 hover:text-white/70 transition-colors">
            ← Retour au dashboard
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="bg-white border-b border-neutral-200 px-6 h-14 flex items-center justify-between flex-shrink-0">
          <h1 className="text-sm font-bold text-neutral-900">Administration MarketLens</h1>
          <span className="badge badge-red text-xs">SuperAdmin</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
