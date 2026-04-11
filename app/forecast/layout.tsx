import Link from 'next/link'
import { TrendingUp, LayoutDashboard, LogIn, User } from 'lucide-react'
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
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo + nav */}
          <div className="flex items-center gap-6">
            <Link href="/forecast" className="flex items-center gap-2 text-sm font-bold text-white">
              <TrendingUp size={16} className="text-blue-400" />
              <span>Durendal <span className="text-blue-400">Forecast</span></span>
            </Link>
            <ForecastNav locale={locale} />
          </div>

          {/* Actions droite */}
          <div className="flex items-center gap-3">
            {/* Sélecteur de langue */}
            <LocaleSwitcher current={locale} />

            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  <LayoutDashboard size={13} />
                  {tr(locale, 'nav.dashboard')}
                </Link>
                <Link
                  href="/profil"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium transition-colors"
                >
                  <User size={13} />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {user.email?.split('@')[0] ?? 'Profil'}
                  </span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="hidden sm:inline text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  {tr(locale, 'footer.veille')} →
                </Link>
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  <LogIn size={13} />
                  {tr(locale, 'nav.login')}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-neutral-800 mt-20 py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-neutral-600">
            Durendal Forecast — {tr(locale, 'footer.disclaimer')}
          </p>
          <div className="flex items-center gap-4 text-xs text-neutral-700">
            <Link href="/forecast"             className="hover:text-neutral-400 transition-colors">{tr(locale, 'nav.explore')}</Link>
            <Link href="/forecast/signals"     className="hover:text-neutral-400 transition-colors">{tr(locale, 'nav.signals')}</Link>
            <Link href="/forecast/leaderboard" className="hover:text-neutral-400 transition-colors">{locale === 'fr' ? 'Classement' : 'Leaderboard'}</Link>
            <Link href="/dashboard" className="hover:text-neutral-400 transition-colors">{tr(locale, 'footer.veille')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
