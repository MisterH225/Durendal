/**
 * Fetch Agent — Layer 2
 * Récupère les pages découvertes, extrait le texte principal.
 * Utilise Firecrawl scrape (priorité) ou fetch natif en fallback.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { firecrawlScrape } from '../services/firecrawl-service'
import crypto from 'crypto'

export interface FetchResult {
  fetchedCount: number
  failedCount: number
  skippedCount: number
  errors: string[]
}

function hashContent(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32)
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

async function nativeFetch(url: string): Promise<{ title: string; text: string; publishedAt: string | null } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketLens/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && !ct.includes('text/plain')) return null

    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch?.[1]?.trim() ?? ''

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10_000)

    return { title, text, publishedAt: null }
  } catch {
    return null
  }
}

export async function fetchPendingSources(
  admin: SupabaseClient,
  accountId: string,
  watchId: string,
  batchSize = 30,
  log: (msg: string) => void,
  searchId?: string,
): Promise<FetchResult> {
  let fetchedCount = 0
  let failedCount = 0
  let skippedCount = 0
  const errors: string[] = []

  let query = admin
    .from('discovered_sources')
    .select('id, url, title, domain, snippet')
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .order('relevance_score', { ascending: false })
    .limit(batchSize)

  if (searchId) {
    query = query.eq('search_id', searchId)
  } else if (watchId) {
    query = query.eq('watch_id', watchId)
  }

  const { data: sources } = await query

  if (!sources?.length) {
    log(`[fetch] Aucune source en attente`)
    return { fetchedCount: 0, failedCount: 0, skippedCount: 0, errors: [] }
  }

  log(`[fetch] ${sources.length} sources à récupérer`)

  for (const src of sources) {
    try {
      // Check if already fetched (by URL)
      const { data: existing } = await admin
        .from('fetched_pages')
        .select('id')
        .eq('account_id', accountId)
        .eq('url', src.url)
        .limit(1)

      if (existing?.length) {
        await admin.from('discovered_sources').update({ status: 'duplicate' }).eq('id', src.id)
        skippedCount++
        continue
      }

      // Try Firecrawl first, then native fetch
      let title = src.title ?? ''
      let text = ''
      let publishedAt: string | null = null
      let metadata: Record<string, any> = {}
      let fetchStatus: 'success' | 'failed' | 'timeout' | 'blocked' = 'success'

      const fcResult = await firecrawlScrape(src.url)
      if (fcResult && fcResult.text.length > 50) {
        title = fcResult.title || title
        text = fcResult.text
        metadata = fcResult.metadata
        publishedAt = fcResult.publishedAt ?? null
      } else {
        const native = await nativeFetch(src.url)
        if (native && native.text.length > 50) {
          title = native.title || title
          text = native.text
          publishedAt = native.publishedAt
        } else {
          fetchStatus = 'failed'
        }
      }

      if (fetchStatus === 'failed' || text.length < 50) {
        await admin.from('discovered_sources').update({ status: 'failed' }).eq('id', src.id)
        failedCount++
        continue
      }

      const contentHash = hashContent(text)
      const wordCount = text.split(/\s+/).length

      const { error: insertErr } = await admin.from('fetched_pages').upsert({
        account_id: accountId,
        source_id: src.id,
        url: src.url,
        domain: src.domain || extractDomain(src.url),
        title,
        published_at: publishedAt,
        extracted_text: text,
        metadata,
        fetch_status: fetchStatus,
        content_hash: contentHash,
        word_count: wordCount,
      }, { onConflict: 'account_id,url' })

      if (insertErr) {
        errors.push(`Page insert ${src.url}: ${insertErr.message}`)
        failedCount++
      } else {
        await admin.from('discovered_sources').update({ status: 'fetched' }).eq('id', src.id)
        fetchedCount++
      }

      await new Promise(r => setTimeout(r, 200))
    } catch (e: any) {
      errors.push(`Fetch ${src.url}: ${e.message}`)
      failedCount++
      await admin.from('discovered_sources').update({ status: 'failed' }).eq('id', src.id)
    }
  }

  log(`[fetch] Résultat: ${fetchedCount} récupérés | ${failedCount} échecs | ${skippedCount} doublons`)
  return { fetchedCount, failedCount, skippedCount, errors }
}
