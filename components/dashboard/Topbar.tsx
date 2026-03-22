'use client'
import { usePathname } from 'next/navigation'
import { Bell, HelpCircle } from 'lucide-react'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/veilles': 'Mes veilles',
  '/marche': 'Analyse marché',
  '/agents': 'Agents IA',
  '/actions': 'Actions marché',
  '/assistant': 'Assistant IA',
  '/forfait': 'Forfait',
  '/admin': 'Panel Admin',
  '/admin/users': 'Utilisateurs',
  '/admin/plans': 'Plans & offres',
  '/admin/sources': 'Bibliothèque sources',
  '/admin/access': 'Accès spéciaux',
}

export default function Topbar({ profile }: { profile: any }) {
  const pathname = usePathname()
  const title = pageTitles[pathname] || 'MarketLens'
  const planName = profile?.accounts?.plans?.display_name || 'Free'

  return (
    <header className="bg-white border-b border-neutral-200 px-4 md:px-6 h-14 flex items-center justify-between flex-shrink-0">
      <h1 className="text-sm font-semibold text-neutral-900">{title}</h1>

      <div className="flex items-center gap-2">
        {/* Plan badge */}
        <span className={`badge hidden sm:inline-flex ${
          planName === 'Free' ? 'badge-gray' :
          planName === 'Pro' ? 'badge-blue' : 'badge-purple'
        }`}>
          {planName} actif
        </span>

        {/* Help */}
        <button className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-500 transition-colors">
          <HelpCircle size={16} />
        </button>

        {/* Notifications */}
        <button className="w-8 h-8 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-500 relative transition-colors">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold">
          {profile?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase() || 'ML'}
        </div>
      </div>
    </header>
  )
}
