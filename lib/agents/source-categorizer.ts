/**
 * source-categorizer.ts
 * Agent autonome de catégorisation IA des sources de la bibliothèque.
 *
 * Indépendant des agents de collecte (1–4).
 * Déclenché automatiquement à l'ajout d'une source ou manuellement par le superadmin.
 */

import { callGemini, parseGeminiJson, type GeminiModel } from '@/lib/ai/gemini'

export interface CategorizationResult {
  sourceId:     string
  domains:      string[]
  description:  string
  confidence:   number
  categorySuggestion?: string
}

export interface DuplicateGroup {
  canonicalDomain: string
  sources: { id: string; name: string; url: string; is_active: boolean; created_at: string }[]
}

export interface AgentRunResult {
  processed: number
  updated:   number
  duplicatesFound: number
  duplicatesDeactivated: number
  errors:    string[]
  durationMs: number
}

// ── Normalisation d'URL pour détection de doublons ──────────────────────────

/**
 * Extrait un domaine canonique comparable à partir d'une URL.
 * "https://www.example.com/page?q=1" → "example.com"
 */
export function canonicalDomain(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`)
    return url.hostname
      .replace(/^www\./, '')
      .replace(/^m\./, '')
      .replace(/^mobile\./, '')
      .toLowerCase()
  } catch {
    return rawUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  }
}

/**
 * Détecte les doublons parmi toutes les sources actives.
 * Regroupe par domaine canonique ; les groupes de taille > 1 sont des doublons.
 */
export async function detectDuplicates(
  supabase: any,
): Promise<DuplicateGroup[]> {
  const { data: sources } = await supabase
    .from('sources')
    .select('id, name, url, is_active, created_at')
    .not('url', 'is', null)
    .order('created_at', { ascending: true })

  if (!sources?.length) return []

  const byDomain = new Map<string, typeof sources>()
  for (const src of sources) {
    if (!src.url) continue
    const domain = canonicalDomain(src.url)
    const group = byDomain.get(domain) ?? []
    group.push(src)
    byDomain.set(domain, group)
  }

  return Array.from(byDomain.entries())
    .filter(([, group]) => group.length > 1)
    .map(([canonicalDomain, sources]) => ({ canonicalDomain, sources }))
}

/**
 * Désactive les doublons, en gardant la plus ancienne source active.
 * Retourne le nombre de sources désactivées.
 */
export async function deactivateDuplicates(
  supabase: any,
  log: (msg: string) => void = console.log,
): Promise<{ found: number; deactivated: number }> {
  const groups = await detectDuplicates(supabase)
  let deactivated = 0

  for (const group of groups) {
    const activeOnes = group.sources.filter(s => s.is_active)
    if (activeOnes.length <= 1) continue

    // Garder la plus ancienne active, désactiver les autres
    const [keeper, ...duplicates] = activeOnes
    log(`[Dedup] ${group.canonicalDomain}: garde "${keeper.name}" (${keeper.id}), désactive ${duplicates.length} doublon(s)`)

    for (const dup of duplicates) {
      const { error } = await supabase
        .from('sources')
        .update({ is_active: false, admin_notes: `Doublon de "${keeper.name}" (${keeper.id}) — désactivé par l'agent` })
        .eq('id', dup.id)

      if (!error) {
        deactivated++
        log(`  → ✗ "${dup.name}" désactivé`)
      }
    }
  }

  return {
    found: groups.reduce((sum, g) => sum + g.sources.filter(s => s.is_active).length - 1, 0),
    deactivated,
  }
}

/**
 * Vérifie si une URL existe déjà dans la bibliothèque (avant insertion).
 * Retourne la source existante ou null.
 */
export async function findExistingSourceByUrl(
  supabase: any,
  url: string,
): Promise<{ id: string; name: string; url: string } | null> {
  const domain = canonicalDomain(url)

  const { data: allSources } = await supabase
    .from('sources')
    .select('id, name, url')
    .not('url', 'is', null)

  if (!allSources?.length) return null

  return allSources.find((s: any) => s.url && canonicalDomain(s.url) === domain) ?? null
}

/**
 * Catégorise une seule source en utilisant le prompt configurable.
 */
export async function categorizeSource(
  source: {
    id: string
    url?: string | null
    name: string
    source_category?: string | null
    sectors?: string[] | null
  },
  prompt: string,
  model: GeminiModel = 'gemini-2.5-flash',
): Promise<CategorizationResult | null> {
  if (!source.url) return null

  const filledPrompt = prompt
    .replace('{{url}}', source.url)
    .replace('{{name}}', source.name)
    .replace('{{source_category}}', source.source_category ?? 'non définie')
    .replace('{{sectors}}', (source.sectors ?? []).join(', ') || 'non définis')

  try {
    const { text } = await callGemini(filledPrompt, {
      model,
      maxOutputTokens: 500,
      temperature: 0.1,
    })

    const parsed = parseGeminiJson<{
      domains: string[]
      description: string
      confidence: number
      source_category_suggestion?: string
    }>(text)

    if (!parsed || !parsed.domains?.length) return null

    return {
      sourceId:           source.id,
      domains:            parsed.domains.slice(0, 5),
      description:        parsed.description || '',
      confidence:         typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      categorySuggestion: parsed.source_category_suggestion,
    }
  } catch {
    return null
  }
}

/**
 * Exécute l'agent sur un ensemble de sources.
 * Charge la config depuis admin_agents, catégorise, met à jour la DB.
 */
export async function runSourceCategorizer(
  supabase: any,
  options: {
    sourceIds?: string[]
    forceAll?: boolean
    trigger?: 'manual' | 'auto_insert' | 'bulk'
  } = {},
  log: (msg: string) => void = console.log,
): Promise<AgentRunResult> {
  const start = Date.now()
  const errors: string[] = []
  let processed = 0
  let updated = 0
  let duplicatesFound = 0
  let duplicatesDeactivated = 0

  // Charge la config de l'agent
  const { data: agent } = await supabase
    .from('admin_agents')
    .select('*')
    .eq('id', 'source_categorizer')
    .single()

  if (!agent) {
    return { processed: 0, updated: 0, duplicatesFound: 0, duplicatesDeactivated: 0, errors: ['Agent non configuré'], durationMs: Date.now() - start }
  }

  if (agent.status !== 'active') {
    log('[Categorizer] Agent en pause ou désactivé — skip')
    return { processed: 0, updated: 0, duplicatesFound: 0, duplicatesDeactivated: 0, errors: ['Agent inactif'], durationMs: Date.now() - start }
  }

  // Crée un run log
  const { data: run } = await supabase
    .from('admin_agent_runs')
    .insert({
      agent_id:   'source_categorizer',
      status:     'running',
      trigger:    options.trigger ?? 'manual',
    })
    .select().single()

  // ── Phase 1 : Détection et nettoyage des doublons ───────────────────
  log('[Categorizer] Phase 1 — Détection des doublons...')
  try {
    const dedupResult = await deactivateDuplicates(supabase, log)
    duplicatesFound = dedupResult.found
    duplicatesDeactivated = dedupResult.deactivated
    if (duplicatesDeactivated > 0) {
      log(`[Categorizer] ${duplicatesDeactivated} doublon(s) désactivé(s)`)
    } else {
      log('[Categorizer] Aucun doublon détecté')
    }
  } catch (e: any) {
    const msg = `Erreur détection doublons: ${e?.message ?? 'inconnue'}`
    errors.push(msg)
    log(`[Categorizer] ${msg}`)
  }

  // ── Phase 2 : Catégorisation IA ─────────────────────────────────────
  log('[Categorizer] Phase 2 — Catégorisation IA...')

  let query = supabase
    .from('sources')
    .select('id, url, name, source_category, sectors')
    .eq('is_active', true)
    .not('url', 'is', null)

  if (options.sourceIds?.length) {
    query = query.in('id', options.sourceIds)
  } else if (!options.forceAll) {
    query = query.is('ai_categorized_at', null)
  }

  const { data: sources, error: srcErr } = await query.limit(100)

  if (srcErr || !sources) {
    const msg = `Erreur chargement sources: ${srcErr?.message ?? 'aucune donnée'}`
    errors.push(msg)
    log(`[Categorizer] ${msg}`)

    if (run?.id) {
      await supabase.from('admin_agent_runs').update({
        status: 'error', error_message: msg, completed_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
      }).eq('id', run.id)
    }

    return { processed: 0, updated: 0, duplicatesFound, duplicatesDeactivated, errors, durationMs: Date.now() - start }
  }

  log(`[Categorizer] ${sources.length} source(s) à catégoriser`)

  for (const source of sources) {
    processed++
    log(`[Categorizer] ${processed}/${sources.length} — "${source.name}" (${source.url})`)

    const result = await categorizeSource(source, agent.prompt, agent.model as GeminiModel)

    if (result) {
      const { error: upErr } = await supabase.from('sources').update({
        ai_domains:        result.domains,
        ai_description:    result.description,
        ai_confidence:     result.confidence,
        ai_categorized_at: new Date().toISOString(),
        ...(result.categorySuggestion && !source.source_category
          ? { source_category: result.categorySuggestion }
          : {}),
      }).eq('id', source.id)

      if (upErr) {
        errors.push(`Update "${source.name}": ${upErr.message}`)
      } else {
        updated++
        log(`  → ${result.domains.join(', ')} (${Math.round(result.confidence * 100)}%)`)
      }
    } else {
      errors.push(`Catégorisation échouée: "${source.name}"`)
      log(`  → ✗ échec catégorisation`)
    }

    await new Promise(r => setTimeout(r, 200))
  }

  const durationMs = Date.now() - start

  // Met à jour le run et l'agent
  if (run?.id) {
    await supabase.from('admin_agent_runs').update({
      status:            'done',
      sources_processed: processed,
      sources_updated:   updated,
      duration_ms:       durationMs,
      error_message:     errors.length > 0 ? errors.join('; ') : null,
      metadata:          { duplicatesFound, duplicatesDeactivated },
      completed_at:      new Date().toISOString(),
    }).eq('id', run.id)
  }

  await supabase.from('admin_agents').update({
    last_run_at:  new Date().toISOString(),
    runs_count:   (agent.runs_count ?? 0) + 1,
    errors_count: (agent.errors_count ?? 0) + errors.length,
    updated_at:   new Date().toISOString(),
  }).eq('id', 'source_categorizer')

  log(`[Categorizer] ✓ ${updated}/${processed} sources catégorisées, ${duplicatesDeactivated} doublons nettoyés — ${durationMs}ms`)

  return { processed, updated, duplicatesFound, duplicatesDeactivated, errors, durationMs }
}
