/**
 * Normalisation des noms d'entreprises.
 *
 * Objectif : éviter que "SIFCA", "Groupe SIFCA", "SIFCA SA" soient 3 comptes.
 * Approche prudente : normalisation textuelle + hash de dédup, pas de fusion agressive.
 */

const LEGAL_SUFFIXES = [
  'sa', 's.a.', 's.a', 'sarl', 's.a.r.l', 'sas', 's.a.s', 'sasu',
  'ltd', 'limited', 'llc', 'l.l.c', 'inc', 'incorporated', 'corp', 'corporation',
  'gmbh', 'ag', 'plc', 'pty', 'bv', 'nv', 'se',
  'spa', 's.p.a', 'srl', 's.r.l',
  'ci', 'côte d\'ivoire', 'africa', 'afrique',
]

const PREFIXES = [
  'groupe', 'group', 'the', 'les', 'la', 'le', 'société', 'ste', 'societe',
  'ets', 'etablissements', 'entreprise', 'compagnie', 'cie',
]

export function normalizeName(raw: string): string {
  let name = raw.trim().toLowerCase()

  name = name.replace(/[''`]/g, "'")
  name = name.replace(/[""«»]/g, '')
  name = name.replace(/\s+/g, ' ')

  // Retirer les formes juridiques en fin
  for (const suffix of LEGAL_SUFFIXES) {
    const re = new RegExp(`\\s+${suffix.replace(/\./g, '\\.')}\\s*$`, 'i')
    name = name.replace(re, '')
  }
  // Retirer aussi si entre parenthèses à la fin
  name = name.replace(/\s*\([^)]*\)\s*$/, '')

  // Retirer les préfixes courants
  for (const prefix of PREFIXES) {
    const re = new RegExp(`^${prefix}\\s+`, 'i')
    name = name.replace(re, '')
  }

  return name.trim()
}

export function dedupeHash(name: string, country?: string): string {
  const normalized = normalizeName(name)
  const base = normalized.replace(/[^a-z0-9]/g, '')
  return country ? `${base}::${country.toLowerCase()}` : base
}

/**
 * Score de similarité simple entre deux noms normalisés (0-1).
 * Pas de Levenshtein complet pour la perf ; on compare les tokens communs.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)

  if (na === nb) return 1.0

  const tokensA = new Set(na.split(/\s+/))
  const tokensB = new Set(nb.split(/\s+/))

  let common = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) common++
  }

  const maxLen = Math.max(tokensA.size, tokensB.size)
  return maxLen > 0 ? common / maxLen : 0
}

/**
 * Vérifie si deux noms réfèrent probablement à la même entreprise.
 * Seuil conservateur : 0.7 (70% de tokens en commun).
 */
export function isProbableDuplicate(a: string, b: string, threshold = 0.7): boolean {
  return nameSimilarity(a, b) >= threshold
}

export function normalizeDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}
