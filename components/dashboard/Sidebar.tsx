'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard, Eye, TrendingUp, Bot, Star, MessageSquare,
  CreditCard, X, LogOut, ChevronRight, Settings
} from 'lucide-react'

const navItems = [
  { section: 'Principal', items: [
    { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
    { href: '/veilles', label: 'Mes veilles', icon: Eye },
    { href: '/marche', label: 'Analyse marché', icon: TrendingUp },
  ]},
  { section: 'Agents IA', items: [
    { href: '/agents', label: 'Agents IA', icon: Bot },
    { href: '/actions', label: 'Actions marché', icon: Star },
    { href: '/assistant', label: 'Assistant IA', icon: MessageSquare },
  ]},
  { section: 'Compte', items: [
    { href: '/forfait', label: 'Forfait', icon: CreditCard },
  ]},
]

export default function Sidebar({ profile }: { profile: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = profile?.full_name
    ?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'ML'

  const planName = profile?.accounts?.plans?.display_name || 'Free'
  const isAdmin = profile?.role === 'superadmin'

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-black flex items-center justify-center">
            <img src="/logo.png" alt="MarketLens" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight">MarketLens</div>
            <div className="text-[10px] text-white/40">Veille · Afrique</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map(({ section, items }) => (
          <div key={section}>
            <div className="section-header">{section}</div>
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link key={href} href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`sidebar-item ${active ? 'sidebar-item-active' : ''}`}>
                  <Icon size={15} />
                  <span>{label}</span>
                  {active && <ChevronRight size={12} className="ml-auto opacity-50" />}
                </Link>
              )
            })}
          </div>
        ))}

        {/* Admin link */}
        {isAdmin && (
          <div>
            <div className="section-header">Administration</div>
            <Link href="/admin" onClick={() => setMobileOpen(false)}
              className={`sidebar-item ${pathname.startsWith('/admin') ? 'sidebar-item-active' : ''}`}>
              <Settings size={15} />
              <span>Panel Admin</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User bottom */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{profile?.full_name}</div>
            <div className="text-[10px] text-white/40">{planName} · actif</div>
          </div>
          <button onClick={logout} title="Déconnexion"
            className="text-white/30 hover:text-red-400 transition-colors p-1">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-52 flex-shrink-0 bg-neutral-900 flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile menu button (dans la topbar, géré via état global) */}
      <button
        id="mobile-menu-btn"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 right-4 z-40 w-12 h-12 bg-blue-700 rounded-full shadow-lg flex items-center justify-center text-white">
        <LayoutDashboard size={20} />
      </button>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-neutral-900 flex flex-col shadow-xl">
            <button onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 text-white/50 hover:text-white">
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-neutral-200 flex">
        {[
          { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { href: '/veilles', icon: Eye, label: 'Veilles' },
          { href: '/marche', icon: TrendingUp, label: 'Marché' },
          { href: '/assistant', icon: MessageSquare, label: 'Assistant' },
          { href: '/forfait', icon: CreditCard, label: 'Forfait' },
        ].map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href}
              className={`flex-1 flex flex-col items-center py-2 gap-1 text-[10px] font-medium transition-colors
                ${active ? 'text-blue-700' : 'text-neutral-400'}`}>
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
