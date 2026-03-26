import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=Code+manquant', requestUrl.origin))
  }

  try {
    const redirectTo = new URL(next, requestUrl.origin)
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
        new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
      )
    }

    return supabaseResponse
  } catch (e) {
    console.error('[auth/callback] Exception:', e)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent('Erreur serveur: ' + String(e))}`, requestUrl.origin)
    )
  }
}
