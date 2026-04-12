'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Eye, Bot } from 'lucide-react'

const links = [
  { href: '/forecast/veille',          labelFr: 'Dashboard',   labelEn: 'Dashboard',   icon: LayoutDashboard, exact: true },
  { href: '/forecast/veille/watches',  labelFr: 'Mes veilles', labelEn: 'My watches',  icon: Eye,             exact: false },
  { href: '/forecast/veille/agents',   labelFr: 'Agents IA',   labelEn: 'AI Agents',   icon: Bot,             exact: false },
]

export function VeilleSubNav({ locale }: { locale: string }) {
  const pathname = usePathname()

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800/60">
      <div className="max-w-6xl mx-auto px-3 sm:px-4">
        <nav className="flex items-center gap-1 py-1.5 overflow-x-auto">
          {links.map(({ href, labelFr, labelEn, icon: Icon, exact }) => {
            const active = exact
              ? pathname === href
              : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'text-neutral-900 bg-neutral-200 dark:text-white dark:bg-neutral-800'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/80 dark:text-neutral-500 dark:hover:text-neutral-300 dark:hover:bg-neutral-800/40'
                }`}
              >
                <Icon size={12} />
                {locale === 'fr' ? labelFr : labelEn}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
