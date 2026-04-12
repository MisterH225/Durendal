import Link from 'next/link'
import { TrendingUp, LogIn, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ForecastNav } from '@/components/forecast/ForecastNav'
import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { getLocale } from '@/lib/i18n/server'
import { tr } from '@/lib/i18n/translations'

export default async function ForecastLayout({ children }: { children: React.ReactNode }) {
  let user: { email?: string; id: string } | null = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user as typeof user
  } catch { /* mode non-auth */ }

  const locale = getLocale()

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-12 sm:h-14 flex items-center justify-between">
          {/* Logo + nav */}
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <Link href="/forecast" className="flex items-center gap-1.5 sm:gap-2 text-sm font-bold text-white flex-shrink-0">
              <TrendingUp size={16} className="text-blue-400" />
              <span className="hidden sm:inline">Durendal <span className="text-blue-400">Forecast</span></span>
              <span className="sm:hidden text-blue-400 text-xs font-bold">DF</span>
            </Link>
            <ForecastNav locale={locale} />
          </div>

          {/* Actions droite */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <LocaleSwitcher current={locale} />

            {user ? (
              <Link
                href="/profil"
                className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium transition-colors"
              >
                <User size={13} />
                <span className="hidden sm:inline max-w-[100px] truncate">
                  {user.email?.split('@')[0] ?? 'Profil'}
                </span>
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-xs px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
              >
                <LogIn size={13} />
                <span className="hidden sm:inline">{tr(locale, 'nav.login')}</span>
                <span className="sm:hidden">{locale === 'fr' ? 'Connexion' : 'Login'}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile bottom nav */}
        <div className="md:hidden border-t border-neutral-800/60 overflow-x-auto">
          <div className="flex items-center gap-1 px-3 py-1.5 min-w-max">
            {[
              { href: '/forecast', label: tr(locale, 'nav.explore') },
              { href: '/forecast/signals', label: tr(locale, 'nav.signals') },
              { href: '/forecast/leaderboard', label: tr(locale, 'nav.leaderboard') },
              { href: '/forecast/veille', label: locale === 'fr' ? 'Veille' : 'Intel' },
            ].map(link => (
              <Link key={link.href} href={link.href}
                className="text-[10px] px-2.5 py-1 rounded-md font-medium text-neutral-400 hover:text-white hover:bg-neutral-800/50 transition-colors whitespace-nowrap">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-neutral-800 mt-12 sm:mt-20 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] sm:text-xs text-neutral-600 text-center sm:text-left">
            Durendal Forecast — {tr(locale, 'footer.disclaimer')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-[10px] sm:text-xs text-neutral-700">
            <Link href="/forecast"             className="hover:text-neutral-400 transition-colors">{tr(locale, 'nav.explore')}</Link>
            <Link href="/forecast/signals"     className="hover:text-neutral-400 transition-colors">{tr(locale, 'nav.signals')}</Link>
            <Link href="/forecast/leaderboard" className="hover:text-neutral-400 transition-colors">{tr(locale, 'nav.leaderboard')}</Link>
            <Link href="/forecast/veille"      className="hover:text-neutral-400 transition-colors">{tr(locale, 'nav.veille')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
