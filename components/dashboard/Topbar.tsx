'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, HelpCircle } from 'lucide-react'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/veilles': 'Mes veilles',
  '/marche': 'Analyse marché',
  '/agents': 'Agents IA',
  '/actions': 'Actions marché',
  '/assistant': 'Assistant IA',
  '/forfait': 'Forfait',
  '/profil': 'Mon profil',
  '/notifications': 'Notifications',
  '/admin': 'Panel Admin',
  '/admin/users': 'Utilisateurs',
  '/admin/plans': 'Plans & offres',
  '/admin/sources': 'Bibliothèque sources',
  '/admin/access': 'Accès spéciaux',
}

export default function Topbar({ profile, unreadCount = 0 }: { profile: any; unreadCount?: number }) {
  const pathname = usePathname()
  const title = pageTitles[pathname] || 'MarketLens'
  const planName = profile?.accounts?.plans?.display_name || 'Free'
  const initials = profile?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'ML'

  return (
    <header className="bg-white border-b border-neutral-200 px-4 md:px-6 h-14 flex items-center justify-between flex-shrink-0">
      <h1 className="text-sm font-semibold text-neutral-900">{title}</h1>

      <div className="flex items-center gap-2">
        {/* Plan badge */}
        <Link href="/forfait"
          className={`badge hidden sm:inline-flex hover:opacity-80 transition-opacity cursor-pointer ${
            planName === 'Free' ? 'badge-gray' :
            planName === 'Pro' ? 'badge-blue' : 'badge-purple'
          }`}>
          {planName} actif
        </Link>

        {/* Help */}
        <Link href="/assistant" title="Aide — Assistant IA"
          className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-500 transition-colors">
          <HelpCircle size={16} />
        </Link>

        {/* Notifications */}
        <Link href="/notifications" title="Notifications"
          className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-500 relative transition-colors">
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Avatar → Profil */}
        <Link href="/profil" title="Mon profil"
          className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-blue-300 transition-all">
          {initials}
        </Link>
      </div>
    </header>
  )
}
