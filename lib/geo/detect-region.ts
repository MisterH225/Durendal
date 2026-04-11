import { headers } from 'next/headers'

export type RegionCode = 'africa' | 'middle-east' | 'asia' | 'europe' | 'americas' | 'global'

const COUNTRY_TO_REGION: Record<string, RegionCode> = {
  // Africa
  DZ: 'africa', AO: 'africa', BJ: 'africa', BW: 'africa', BF: 'africa', BI: 'africa',
  CM: 'africa', CV: 'africa', CF: 'africa', TD: 'africa', KM: 'africa', CG: 'africa',
  CD: 'africa', CI: 'africa', DJ: 'africa', EG: 'africa', GQ: 'africa', ER: 'africa',
  ET: 'africa', GA: 'africa', GM: 'africa', GH: 'africa', GN: 'africa', GW: 'africa',
  KE: 'africa', LS: 'africa', LR: 'africa', LY: 'africa', MG: 'africa', MW: 'africa',
  ML: 'africa', MR: 'africa', MU: 'africa', MA: 'africa', MZ: 'africa', NA: 'africa',
  NE: 'africa', NG: 'africa', RW: 'africa', ST: 'africa', SN: 'africa', SC: 'africa',
  SL: 'africa', SO: 'africa', ZA: 'africa', SS: 'africa', SD: 'africa', SZ: 'africa',
  TZ: 'africa', TG: 'africa', TN: 'africa', UG: 'africa', ZM: 'africa', ZW: 'africa',

  // Middle East
  BH: 'middle-east', IR: 'middle-east', IQ: 'middle-east', IL: 'middle-east',
  JO: 'middle-east', KW: 'middle-east', LB: 'middle-east', OM: 'middle-east',
  PS: 'middle-east', QA: 'middle-east', SA: 'middle-east', SY: 'middle-east',
  TR: 'middle-east', AE: 'middle-east', YE: 'middle-east',

  // Asia (East, South, Southeast, Central)
  AF: 'asia', AM: 'asia', AZ: 'asia', BD: 'asia', BT: 'asia', BN: 'asia',
  KH: 'asia', CN: 'asia', GE: 'asia', HK: 'asia', IN: 'asia', ID: 'asia',
  JP: 'asia', KZ: 'asia', KG: 'asia', LA: 'asia', MO: 'asia', MY: 'asia',
  MV: 'asia', MN: 'asia', MM: 'asia', NP: 'asia', KP: 'asia', KR: 'asia',
  PK: 'asia', PH: 'asia', SG: 'asia', LK: 'asia', TW: 'asia', TJ: 'asia',
  TH: 'asia', TL: 'asia', TM: 'asia', UZ: 'asia', VN: 'asia',
  AU: 'asia', NZ: 'asia', FJ: 'asia', PG: 'asia',

  // Europe
  AL: 'europe', AD: 'europe', AT: 'europe', BY: 'europe', BE: 'europe',
  BA: 'europe', BG: 'europe', HR: 'europe', CY: 'europe', CZ: 'europe',
  DK: 'europe', EE: 'europe', FI: 'europe', FR: 'europe', DE: 'europe',
  GR: 'europe', HU: 'europe', IS: 'europe', IE: 'europe', IT: 'europe',
  XK: 'europe', LV: 'europe', LI: 'europe', LT: 'europe', LU: 'europe',
  MT: 'europe', MD: 'europe', MC: 'europe', ME: 'europe', NL: 'europe',
  MK: 'europe', NO: 'europe', PL: 'europe', PT: 'europe', RO: 'europe',
  RU: 'europe', SM: 'europe', RS: 'europe', SK: 'europe', SI: 'europe',
  ES: 'europe', SE: 'europe', CH: 'europe', UA: 'europe', GB: 'europe',

  // Americas
  AG: 'americas', AR: 'americas', BS: 'americas', BB: 'americas', BZ: 'americas',
  BO: 'americas', BR: 'americas', CA: 'americas', CL: 'americas', CO: 'americas',
  CR: 'americas', CU: 'americas', DM: 'americas', DO: 'americas', EC: 'americas',
  SV: 'americas', GD: 'americas', GT: 'americas', GY: 'americas', HT: 'americas',
  HN: 'americas', JM: 'americas', MX: 'americas', NI: 'americas', PA: 'americas',
  PY: 'americas', PE: 'americas', KN: 'americas', LC: 'americas', VC: 'americas',
  SR: 'americas', TT: 'americas', US: 'americas', UY: 'americas', VE: 'americas',
}

export function countryToRegion(countryCode: string | null | undefined): RegionCode {
  if (!countryCode) return 'global'
  return COUNTRY_TO_REGION[countryCode.toUpperCase()] ?? 'global'
}

/**
 * Detect the user's region from request headers (server component compatible).
 * Works with Vercel, Cloudflare, and standard proxy headers.
 */
export function detectRegionFromHeaders(): RegionCode {
  const h = headers()

  // Vercel provides country directly
  const vercelCountry = h.get('x-vercel-ip-country')
  if (vercelCountry) return countryToRegion(vercelCountry)

  // Cloudflare
  const cfCountry = h.get('cf-ipcountry')
  if (cfCountry) return countryToRegion(cfCountry)

  // Fallback: no IP-based detection available in local dev
  return 'global'
}

export const REGION_LABELS: Record<RegionCode, { fr: string; en: string }> = {
  africa:        { fr: 'Afrique',      en: 'Africa' },
  'middle-east': { fr: 'Moyen-Orient', en: 'Middle East' },
  asia:          { fr: 'Asie',         en: 'Asia' },
  europe:        { fr: 'Europe',       en: 'Europe' },
  americas:      { fr: 'Amériques',    en: 'Americas' },
  global:        { fr: 'Mondial',      en: 'Global' },
}
