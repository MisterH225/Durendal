/**
 * Signal Extraction Agent — Layer 3
 * Analyse le contenu des pages et produit des signaux métier structurés.
 * Sous-agents spécialisés : recrutement, appel d'offres, expansion, etc.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { callGemini, parseGeminiJson } from '@/lib/ai/gemini'
import { countryName } from '@/lib/countries'
import crypto from 'crypto'
import { SIGNAL_TYPES } from '../signals-taxonomy'

export interface ExtractionResult {
  extractedCount: number
  pagesProcessed: number
  errors: string[]
}

interface RawExtractedSignal {
  signal_type: string
  signal_subtype?: string
  signal_label: string
  signal_summary: string
  company_name: string
  company_country?: string
  confidence: number
  event_date?: string
  extracted_facts: Record<string, any>
}

function dedupeHash(watchId: string, signalType: string, companyName: string, label: string): string {
  const raw = `${watchId}:${signalType}:${companyName.toLowerCase().trim()}:${label.toLowerCase().trim()}`
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

const SIGNAL_TYPE_NAMES = SIGNAL_TYPES.map(s => s.type).join(', ')

function buildExtractionPrompt(
  pageText: string,
  pageUrl: string,
  watchSectors: string[],
  watchCountries: string[],
  targetCompanies: string[],
): string {
  const countryStr = watchCountries.map(c => countryName(c)).join(', ')
  const sectorStr = watchSectors.join(', ')
  const companiesStr = targetCompanies.length > 0
    ? `Entreprises cibles : ${targetCompanies.join(', ')}.`
    : 'Identifie toutes les entreprises mentionnées.'

  return `Tu es un agent d'intelligence commerciale spécialisé.
Analyse ce contenu web et extrais UNIQUEMENT des signaux commerciaux exploitables.

CONTEXTE:
- Marchés cibles : ${countryStr}
- Secteurs : ${sectorStr}
- ${companiesStr}
- Source : ${pageUrl}

TYPES DE SIGNAUX À DÉTECTER :
${SIGNAL_TYPE_NAMES}

CONTENU À ANALYSER :
${pageText.slice(0, 6_000)}

INSTRUCTIONS STRICTES :
1. Chaque signal DOIT correspondre à un fait vérifiable dans le texte
2. signal_label = phrase descriptive en français (ex: "Recrutement massif de 15 postes terrain")
3. signal_summary = résumé factuel 2-3 phrases avec chiffres, dates, noms
4. company_name = nom exact de l'entreprise concernée
5. confidence = 0.0-1.0 (1.0 = fait explicite avec source, 0.3 = inférence)
6. event_date = date de l'événement si mentionnée (YYYY-MM-DD), sinon null
7. extracted_facts = données structurées pertinentes (montants, nombres, postes, etc.)

Réponds UNIQUEMENT en JSON :
{"signals":[{
  "signal_type":"hiring_spike",
  "signal_subtype":"operations",
  "signal_label":"Recrutement massif en opérations",
  "signal_summary":"L'entreprise a publié 15 offres en 3 semaines...",
  "company_name":"SIFCA",
  "company_country":"CI",
  "confidence":0.85,
  "event_date":"2026-03-15",
  "extracted_facts":{"job_count":15,"departments":["operations","supply"],"timeframe":"3 weeks"}
}]}

Si aucun signal pertinent : {"signals":[]}`
}

export async function extractSignalsFromPages(
  admin: SupabaseClient,
  accountId: string,
  watchId: string,
  sectors: string[],
  countries: string[],
  companies: { id: string; name: string }[],
  batchSize = 20,
  log: (msg: string) => void,
): Promise<ExtractionResult> {
  let extractedCount = 0
  let pagesProcessed = 0
  const errors: string[] = []
  const companyNames = companies.map(c => c.name)

  // Get fetched pages not yet processed (via discovered_sources)
  const { data: pages } = await admin
    .from('fetched_pages')
    .select(`
      id, url, domain, title, extracted_text, published_at,
      source:source_id(watch_id)
    `)
    .eq('account_id', accountId)
    .eq('fetch_status', 'success')
    .not('extracted_text', 'is', null)
    .order('fetched_at', { ascending: false })
    .limit(batchSize)

  if (!pages?.length) {
    log(`[extraction] Aucune page à traiter`)
    return { extractedCount: 0, pagesProcessed: 0, errors: [] }
  }

  // Filter to pages linked to our watch
  const relevantPages = pages.filter(p => {
    const src = p.source as any
    return !src?.watch_id || src.watch_id === watchId
  })

  log(`[extraction] ${relevantPages.length} pages à analyser`)

  for (const page of relevantPages) {
    if (!page.extracted_text || page.extracted_text.length < 50) continue

    try {
      const prompt = buildExtractionPrompt(
        page.extracted_text,
        page.url,
        sectors,
        countries,
        companyNames,
      )

      const { text } = await callGemini(prompt, {
        model: 'gemini-2.5-flash',
        maxOutputTokens: 3_000,
      })

      const parsed = parseGeminiJson<{ signals: RawExtractedSignal[] }>(text)
      const signals = (parsed?.signals ?? []).filter(s =>
        s.signal_type && s.signal_label && s.confidence >= 0.3
      )

      pagesProcessed++

      for (const sig of signals) {
        const hash = dedupeHash(watchId, sig.signal_type, sig.company_name, sig.signal_label)

        // Resolve company_id
        let companyId: string | null = null
        const nameNorm = sig.company_name.toLowerCase().trim()
        const match = companies.find(c =>
          c.name.toLowerCase().includes(nameNorm) ||
          nameNorm.includes(c.name.toLowerCase())
        )
        companyId = match?.id ?? null

        let hostname = ''
        try { hostname = new URL(page.url).hostname } catch {}

        const { error: insertErr } = await admin.from('extracted_signals').upsert({
          account_id: accountId,
          watch_id: watchId,
          page_id: page.id,
          company_id: companyId,
          company_name_raw: sig.company_name,
          company_country_raw: sig.company_country ?? null,
          signal_type: sig.signal_type,
          signal_subtype: sig.signal_subtype ?? null,
          signal_label: sig.signal_label,
          signal_summary: sig.signal_summary,
          extracted_facts: sig.extracted_facts ?? {},
          confidence_score: sig.confidence,
          source_reliability: 0.6,
          source_url: page.url,
          source_name: page.title || hostname,
          source_domain: page.domain || hostname,
          event_date: sig.event_date ? new Date(sig.event_date).toISOString() : null,
          dedupe_hash: hash,
        }, { onConflict: 'dedupe_hash' })

        if (insertErr && insertErr.code !== '23505') {
          errors.push(`Signal insert: ${insertErr.message}`)
        } else {
          extractedCount++
        }
      }

      if (signals.length > 0) {
        log(`[extraction] ${page.url.slice(0, 60)} → ${signals.length} signaux`)
      }

      await new Promise(r => setTimeout(r, 150))
    } catch (e: any) {
      errors.push(`Extract ${page.url}: ${e.message}`)
    }
  }

  log(`[extraction] Résultat: ${extractedCount} signaux extraits de ${pagesProcessed} pages`)
  return { extractedCount, pagesProcessed, errors }
}
