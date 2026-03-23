import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Route de diagnostic pour vérifier l'état de la session.
 * À appeler après connexion pour voir si les cookies sont bien reçus.
 * GET /api/auth/status
 */
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return NextResponse.json({
        ok: false,
        error: error.message,
        userId: null,
        hint: 'Cookie mal lu ou session invalide. Vérifiez que les cookies sb-*-auth-token sont envoyés.',
      })
    }

    return NextResponse.json({
      ok: !!user,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      hint: user
        ? 'Session OK. Le middleware devrait laisser accéder au dashboard.'
        : 'Aucune session. Les cookies ne sont peut-être pas envoyés (domaine, path, Nginx).',
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: String(e),
      userId: null,
      hint: 'Erreur lors de la lecture de la session.',
    })
  }
}
