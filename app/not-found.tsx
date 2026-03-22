import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl font-bold text-blue-700 mb-4">404</div>
        <h1 className="text-xl font-bold text-neutral-900 mb-2">Page introuvable</h1>
        <p className="text-sm text-neutral-500 mb-6">Cette page n'existe pas ou a été déplacée.</p>
        <Link href="/dashboard" className="btn-primary inline-block">
          Retour au tableau de bord
        </Link>
      </div>
    </div>
  )
}
