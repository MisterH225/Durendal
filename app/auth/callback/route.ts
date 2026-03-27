import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  // Derrière un reverse proxy (Nginx → Node), request.url contient l'adresse
  // interne (http://localhost:3000). On reconstruit l'origine publique depuis :
  // 1. NEXT_PUBLIC_APP_URL (variable d'env explicite)
  // 2. Headers X-Forwarded-Proto + Host envoyés par Nginx
  // 3. requestUrl.origin en dernier recours
  const fwdProto = request.headers.get('x-forwarded-proto') ?? 'https'
  const fwdHost  = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const trustedOrigin = (
    process.env.NEXT_PUBLIC_APP_URL
    ?? (fwdHost ? `${fwdProto}://${fwdHost}` : requestUrl.origin)
  ).replace(/\/$/, '')

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=Code+manquant', trustedOrigin))
  }

  try {
    const redirectTo = new URL(next, trustedOrigin)
    const supabaseResponse = NextResponse.redirect(redirectTo)
    supabaseResponse.headers.set('Cache-Control', 'private, no-store')

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession error:', error.message)
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, trustedOrigin)
      )
    }

    return supabaseResponse
  } catch (e) {
    console.error('[auth/callback] Exception:', e)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent('Erreur serveur: ' + String(e))}`, trustedOrigin)
    )
  }
}
