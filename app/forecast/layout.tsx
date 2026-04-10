import Link from 'next/link'
import { TrendingUp } from 'lucide-react'

export default function ForecastLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/forecast" className="flex items-center gap-2 text-sm font-bold text-white">
              <TrendingUp size={16} className="text-blue-400" />
              <span>MarketLens <span className="text-blue-400">Forecast</span></span>
            </Link>
            <nav className="hidden md:flex items-center gap-4">
              <Link href="/forecast" className="text-xs text-neutral-400 hover:text-white transition-colors">Explorer</Link>
              <Link href="/forecast/leaderboard" className="text-xs text-neutral-400 hover:text-white transition-colors">Classement</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">Veille →</Link>
            <Link href="/login" className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">Connexion</Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-neutral-800 mt-20 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-neutral-600">
          MarketLens Forecast — Probabilités agrégées à titre informatif uniquement. Aucun pari, aucun token.
        </div>
      </footer>
    </div>
  )
}
