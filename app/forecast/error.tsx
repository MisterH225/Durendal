'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ForecastError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[forecast] page error:', error)
  }, [error])

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white">
          Une erreur est survenue
        </h2>
        <p className="text-sm text-neutral-400">
          La page Forecast n&apos;a pas pu se charger correctement.
          Cela peut être dû à une mise à jour en cours du serveur.
        </p>
        {error.digest && (
          <p className="text-xs text-neutral-600 font-mono">
            Digest: {error.digest}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          <RefreshCw size={14} />
          Réessayer
        </button>
        <Link
          href="/"
          className="text-sm px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
        >
          Accueil
        </Link>
      </div>
    </div>
  )
}
