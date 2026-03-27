/**
 * Liste mondiale des pays avec codes ISO 3166-1 alpha-2, noms et drapeaux.
 * Utilisée partout dans l'app : formulaires, agents, prompts.
 */

export type Country = { code: string; name: string; flag: string }

export const ALL_COUNTRIES: Country[] = [
  // ── Afrique ────────────────────────────────────────────────────────────
  { code: 'DZ', name: 'Algérie', flag: '🇩🇿' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯' },
  { code: 'BW', name: 'Botswana', flag: '🇧🇼' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮' },
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲' },
  { code: 'CV', name: 'Cap-Vert', flag: '🇨🇻' },
  { code: 'CF', name: 'Centrafrique', flag: '🇨🇫' },
  { code: 'TD', name: 'Tchad', flag: '🇹🇩' },
  { code: 'KM', name: 'Comores', flag: '🇰🇲' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬' },
  { code: 'CD', name: 'RD Congo', flag: '🇨🇩' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
  { code: 'DJ', name: 'Djibouti', flag: '🇩🇯' },
  { code: 'EG', name: 'Égypte', flag: '🇪🇬' },
  { code: 'GQ', name: 'Guinée équatoriale', flag: '🇬🇶' },
  { code: 'ER', name: 'Érythrée', flag: '🇪🇷' },
  { code: 'SZ', name: 'Eswatini', flag: '🇸🇿' },
  { code: 'ET', name: 'Éthiopie', flag: '🇪🇹' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
  { code: 'GM', name: 'Gambie', flag: '🇬🇲' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'GN', name: 'Guinée', flag: '🇬🇳' },
  { code: 'GW', name: 'Guinée-Bissau', flag: '🇬🇼' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'LS', name: 'Lesotho', flag: '🇱🇸' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷' },
  { code: 'LY', name: 'Libye', flag: '🇱🇾' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'MW', name: 'Malawi', flag: '🇲🇼' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱' },
  { code: 'MR', name: 'Mauritanie', flag: '🇲🇷' },
  { code: 'MU', name: 'Maurice', flag: '🇲🇺' },
  { code: 'MA', name: 'Maroc', flag: '🇲🇦' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿' },
  { code: 'NA', name: 'Namibie', flag: '🇳🇦' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'RW', name: 'Rwanda', flag: '🇷🇼' },
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳' },
  { code: 'SC', name: 'Seychelles', flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱' },
  { code: 'SO', name: 'Somalie', flag: '🇸🇴' },
  { code: 'ZA', name: 'Afrique du Sud', flag: '🇿🇦' },
  { code: 'SS', name: 'Soudan du Sud', flag: '🇸🇸' },
  { code: 'SD', name: 'Soudan', flag: '🇸🇩' },
  { code: 'TZ', name: 'Tanzanie', flag: '🇹🇿' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
  { code: 'TN', name: 'Tunisie', flag: '🇹🇳' },
  { code: 'UG', name: 'Ouganda', flag: '🇺🇬' },
  { code: 'ZM', name: 'Zambie', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼' },

  // ── Europe ──────────────────────────────────────────────────────────────
  { code: 'DE', name: 'Allemagne', flag: '🇩🇪' },
  { code: 'AT', name: 'Autriche', flag: '🇦🇹' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪' },
  { code: 'BG', name: 'Bulgarie', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatie', flag: '🇭🇷' },
  { code: 'DK', name: 'Danemark', flag: '🇩🇰' },
  { code: 'ES', name: 'Espagne', flag: '🇪🇸' },
  { code: 'FI', name: 'Finlande', flag: '🇫🇮' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'GR', name: 'Grèce', flag: '🇬🇷' },
  { code: 'HU', name: 'Hongrie', flag: '🇭🇺' },
  { code: 'IE', name: 'Irlande', flag: '🇮🇪' },
  { code: 'IT', name: 'Italie', flag: '🇮🇹' },
  { code: 'LU', name: 'Luxembourg', flag: '🇱🇺' },
  { code: 'NL', name: 'Pays-Bas', flag: '🇳🇱' },
  { code: 'NO', name: 'Norvège', flag: '🇳🇴' },
  { code: 'PL', name: 'Pologne', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'CZ', name: 'Tchéquie', flag: '🇨🇿' },
  { code: 'RO', name: 'Roumanie', flag: '🇷🇴' },
  { code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧' },
  { code: 'SE', name: 'Suède', flag: '🇸🇪' },
  { code: 'CH', name: 'Suisse', flag: '🇨🇭' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },

  // ── Amériques ───────────────────────────────────────────────────────────
  { code: 'AR', name: 'Argentine', flag: '🇦🇷' },
  { code: 'BR', name: 'Brésil', flag: '🇧🇷' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'CL', name: 'Chili', flag: '🇨🇱' },
  { code: 'CO', name: 'Colombie', flag: '🇨🇴' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺' },
  { code: 'EC', name: 'Équateur', flag: '🇪🇨' },
  { code: 'US', name: 'États-Unis', flag: '🇺🇸' },
  { code: 'MX', name: 'Mexique', flag: '🇲🇽' },
  { code: 'PA', name: 'Panama', flag: '🇵🇦' },
  { code: 'PE', name: 'Pérou', flag: '🇵🇪' },
  { code: 'DO', name: 'Rép. dominicaine', flag: '🇩🇴' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪' },

  // ── Asie & Océanie ──────────────────────────────────────────────────────
  { code: 'SA', name: 'Arabie saoudite', flag: '🇸🇦' },
  { code: 'AU', name: 'Australie', flag: '🇦🇺' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'CN', name: 'Chine', flag: '🇨🇳' },
  { code: 'KR', name: 'Corée du Sud', flag: '🇰🇷' },
  { code: 'AE', name: 'Émirats arabes unis', flag: '🇦🇪' },
  { code: 'IN', name: 'Inde', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonésie', flag: '🇮🇩' },
  { code: 'IQ', name: 'Irak', flag: '🇮🇶' },
  { code: 'IL', name: 'Israël', flag: '🇮🇱' },
  { code: 'JP', name: 'Japon', flag: '🇯🇵' },
  { code: 'MY', name: 'Malaisie', flag: '🇲🇾' },
  { code: 'NZ', name: 'Nouvelle-Zélande', flag: '🇳🇿' },
  { code: 'PK', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'RU', name: 'Russie', flag: '🇷🇺' },
  { code: 'SG', name: 'Singapour', flag: '🇸🇬' },
  { code: 'TH', name: 'Thaïlande', flag: '🇹🇭' },
  { code: 'TR', name: 'Turquie', flag: '🇹🇷' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
]

/**
 * Résout un code ISO en nom complet.
 * Fallback : retourne le code brut si inconnu.
 */
const _map = new Map(ALL_COUNTRIES.map(c => [c.code, c.name]))
export function countryName(code: string): string {
  return _map.get(code) ?? code
}

/**
 * Résout un tableau de codes en noms complets.
 */
export function countryNames(codes: string[]): string[] {
  return codes.map(c => countryName(c))
}
