import { headers } from 'next/headers'

/** Retourne 'fr' | 'en' en lisant Accept-Language du navigateur. Défaut : 'fr'. */
export function getLocale(): 'fr' | 'en' {
  try {
    const acceptLanguage = headers().get('accept-language') ?? ''
    // Ex : "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7"
    const primary = acceptLanguage.split(',')[0]?.split(';')[0]?.toLowerCase() ?? ''
    if (primary.startsWith('en')) return 'en'
  } catch { /* build time ou test */ }
  return 'fr'
}

/** Retourne le nom localisé d'un channel selon la locale détectée. */
export function localizeChannel(
  channel: { name: string; name_fr?: string | null; name_en?: string | null },
  locale: 'fr' | 'en',
): string {
  if (locale === 'fr') return channel.name_fr ?? channel.name
  return channel.name_en ?? channel.name
}
