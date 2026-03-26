import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Route de diagnostic pour vérifier l'état de la session.
 * À appeler après connexion pour voir si les cookies sont bien reçus.
 * GET /api/auth/status
 */
export async function GET() {
  // Lister tous les cookies reçus (noms seulement, pas les valeurs)
  const cookieStore = cookies()
  const allCookies = cookieStore.getAll()
  const cookieNames = allCookies.map(c => c.name)
  const sbCookies = cookieNames.filter(n => n.startsWith('sb-'))

  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        userId: null,
        cookiesReçus: cookieNames,
        cookiesSupabase: sbCookies,
        diagnostic: sbCookies.length === 0
          ? 'AUCUN cookie Supabase (sb-*) reçu par le serveur. Les cookies ne sont pas créés ou pas envoyés par le navigateur.'
          : `Cookies sb-* présents (${sbCookies.length}) mais session invalide ou expirée.`,
      })
    }

    return NextResponse.json({
      ok: !!user,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      cookiesSupabase: sbCookies,
      diagnostic: user ? 'Session valide.' : 'Pas de session malgré les cookies.',
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: String(e),
      userId: null,
      cookiesReçus: cookieNames,
      cookiesSupabase: sbCookies,
      diagnostic: 'Exception lors de la lecture de la session.',
    })
  }
}
