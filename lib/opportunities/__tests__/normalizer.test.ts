/**
 * Tests unitaires — Normalisation des noms d'entreprises
 */

import { normalizeName, dedupeHash, nameSimilarity, isProbableDuplicate, normalizeDomain } from '../normalizer'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.error(`  ✗ ${label}`) }
}

console.log('\n── normalizeName ──')

assert(normalizeName('SIFCA SA') === normalizeName('Groupe SIFCA'), 'SIFCA SA ≈ Groupe SIFCA')
assert(normalizeName('  SIFCA  ') === 'sifca', 'Trim + lowercase')
assert(normalizeName('Société Générale SA') === 'générale', 'Retire Société + SA')
assert(normalizeName('Les Ciments du Sahel') === 'ciments du sahel', 'Retire Les')
assert(normalizeName('Bolloré (Africa)') === 'bolloré', 'Retire parenthèses finales')

console.log('\n── dedupeHash ──')

assert(dedupeHash('SIFCA SA', 'CI') === dedupeHash('Groupe SIFCA', 'CI'), 'Same hash for SIFCA variants (CI)')
assert(dedupeHash('SIFCA', 'CI') !== dedupeHash('SIFCA', 'FR'), 'Different hash for different countries')

console.log('\n── nameSimilarity ──')

assert(nameSimilarity('SIFCA', 'SIFCA SA') === 1.0, 'Exact normalized match = 1.0')
assert(nameSimilarity('Compagnie des Bauxites', 'Bauxites du Midi') > 0.3, 'Partial overlap > 0.3')
assert(nameSimilarity('Apple', 'Microsoft') === 0, 'Unrelated = 0')

console.log('\n── isProbableDuplicate ──')

assert(isProbableDuplicate('SIFCA', 'Groupe SIFCA'), 'SIFCA ↔ Groupe SIFCA = probable duplicate')
assert(!isProbableDuplicate('Apple Inc', 'Microsoft Corp'), 'Apple ↔ Microsoft = not duplicate')

console.log('\n── normalizeDomain ──')

assert(normalizeDomain('https://www.sifca.ci') === 'sifca.ci', 'Normalize domain from URL')
assert(normalizeDomain('sifca.ci') === 'sifca.ci', 'Normalize plain domain')
assert(normalizeDomain('http://www.google.com/search') === 'google.com', 'Strip www and path')
assert(normalizeDomain('not-a-url') === null || normalizeDomain('not-a-url')?.includes('not-a-url'), 'Invalid URL handled')

console.log(`\n═══════════════════════════════`)
console.log(`  ${passed} passed, ${failed} failed`)
console.log(`═══════════════════════════════\n`)

if (failed > 0) process.exit(1)
