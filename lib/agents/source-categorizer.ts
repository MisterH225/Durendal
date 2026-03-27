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

export interface AgentRunResult {
  processed: number
  updated:   number
  errors:    string[]
  durationMs: number
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

  // Charge la config de l'agent
  const { data: agent } = await supabase
    .from('admin_agents')
    .select('*')
    .eq('id', 'source_categorizer')
    .single()

  if (!agent) {
    return { processed: 0, updated: 0, errors: ['Agent non configuré'], durationMs: Date.now() - start }
  }

  if (agent.status !== 'active') {
    log('[Categorizer] Agent en pause ou désactivé — skip')
    return { processed: 0, updated: 0, errors: ['Agent inactif'], durationMs: Date.now() - start }
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

  // Charge les sources à catégoriser
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

    return { processed: 0, updated: 0, errors, durationMs: Date.now() - start }
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
      status:            errors.length === 0 ? 'done' : 'done',
      sources_processed: processed,
      sources_updated:   updated,
      duration_ms:       durationMs,
      error_message:     errors.length > 0 ? errors.join('; ') : null,
      completed_at:      new Date().toISOString(),
    }).eq('id', run.id)
  }

  await supabase.from('admin_agents').update({
    last_run_at:  new Date().toISOString(),
    runs_count:   (agent.runs_count ?? 0) + 1,
    errors_count: (agent.errors_count ?? 0) + errors.length,
    updated_at:   new Date().toISOString(),
  }).eq('id', 'source_categorizer')

  log(`[Categorizer] ✓ ${updated}/${processed} sources catégorisées en ${durationMs}ms`)

  return { processed, updated, errors, durationMs }
}
