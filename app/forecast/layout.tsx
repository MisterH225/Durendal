import Link from 'next/link'
import { TrendingUp, LayoutDashboard, LogIn, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

export default async function ForecastLayout({ children }: { children: React.ReactNode }) {
  // Optionnel : récupère l'utilisateur connecté pour adapter la nav
  let user: { email?: string; id: string } | null = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user as typeof user
  } catch { /* mode non-auth : nav publique */ }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo + nav */}
          <div className="flex items-center gap-6">
            <Link href="/forecast" className="flex items-center gap-2 text-sm font-bold text-white">
              <TrendingUp size={16} className="text-blue-400" />
              <span>MarketLens <span className="text-blue-400">Forecast</span></span>
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              <Link href="/forecast" className="text-xs text-neutral-400 hover:text-white transition-colors">
                Explorer
              </Link>
              <Link href="/forecast/leaderboard" className="text-xs text-neutral-400 hover:text-white transition-colors">
                Classement
              </Link>
            </nav>
          </div>

          {/* Actions droite */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  <LayoutDashboard size={13} />
                  Tableau de bord
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
                  Veille →
                </Link>
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                >
                  <LogIn size={13} />
                  Connexion
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
            MarketLens Forecast — Probabilités agrégées à titre informatif uniquement. Aucun pari, aucun token.
          </p>
          <div className="flex items-center gap-4 text-xs text-neutral-700">
            <Link href="/forecast" className="hover:text-neutral-400 transition-colors">Explorer</Link>
            <Link href="/forecast/leaderboard" className="hover:text-neutral-400 transition-colors">Classement</Link>
            <Link href="/dashboard" className="hover:text-neutral-400 transition-colors">Veille Pro</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
