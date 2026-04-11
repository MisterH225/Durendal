'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Locale } from '@/lib/i18n/translations'
import { tr } from '@/lib/i18n/translations'

export function ForecastNav({ locale }: { locale: Locale }) {
  const pathname = usePathname()

  const links = [
    { href: '/forecast',            label: tr(locale, 'nav.explore'),     exact: true  },
    { href: '/forecast/signals',    label: tr(locale, 'nav.signals'),     exact: false },
    { href: '/forecast/leaderboard',label: tr(locale, 'nav.leaderboard'), exact: false },
    { href: '/forecast/rewards',    label: locale === 'fr' ? 'Recompenses' : 'Rewards', exact: false },
  ]

  return (
    <nav className="hidden md:flex items-center gap-1">
      {links.map(({ href, label, exact }) => {
        const active = exact ? pathname === href || pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              active
                ? 'text-white bg-neutral-800'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
