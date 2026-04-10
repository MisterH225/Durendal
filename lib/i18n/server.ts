import { cookies } from 'next/headers'
import type { Locale } from './translations'

/**
 * Lit la locale depuis le cookie `locale` (préférence user).
 * Fallback sur Accept-Language si pas de cookie.
 * Défaut : 'fr'.
 */
export function getLocale(): Locale {
  try {
    const cookieLocale = cookies().get('locale')?.value
    if (cookieLocale === 'en' || cookieLocale === 'fr') return cookieLocale
  } catch { /* build time */ }

  // Fallback Accept-Language
  try {
    const { headers } = require('next/headers')
    const acceptLanguage = headers().get('accept-language') ?? ''
    const primary = acceptLanguage.split(',')[0]?.split(';')[0]?.toLowerCase() ?? ''
    if (primary.startsWith('en')) return 'en'
  } catch { /* ignore */ }

  return 'fr'
}
