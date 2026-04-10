'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/forecast', label: 'Explorer', exact: true },
  { href: '/forecast/leaderboard', label: 'Classement', exact: false },
]

export function ForecastNav() {
  const pathname = usePathname()

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
