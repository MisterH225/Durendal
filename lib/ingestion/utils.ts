import { createHash } from 'crypto'

/**
 * Normalize and hash a title for dedup comparison.
 * Strips punctuation, lowercases, removes extra whitespace, then SHA-256.
 */
export function hashTitle(title: string): string {
  const normalized = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

/**
 * Extract canonical URL by stripping query params, fragments, and trailing slashes.
 */
export function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.search = ''
    u.hash = ''
    return u.toString().replace(/\/+$/, '')
  } catch {
    return url.trim().toLowerCase()
  }
}

/**
 * Extract domain from URL.
 */
export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Safe ISO timestamp or null.
 */
export function safeIso(val: unknown): string | null {
  if (!val) return null
  const s = String(val)
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Clamp a number between 0 and 1.
 */
export function clamp01(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null
  return Math.max(0, Math.min(1, v))
}

/**
 * Truncate text to max length, adding ellipsis if needed.
 */
export function truncate(text: string | null | undefined, max: number): string | null {
  if (!text) return null
  return text.length <= max ? text : text.slice(0, max - 1) + '\u2026'
}

/**
 * Generate a deterministic correlation ID for an ingestion run.
 */
export function runCorrelationId(providerId: string, flowType: string): string {
  return `${providerId}:${flowType}:${Date.now()}`
}
