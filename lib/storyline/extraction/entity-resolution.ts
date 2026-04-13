// ============================================================================
// EntityResolutionService
// Extracts entities from text and resolves them to canonical IDs.
// Supports: countries, organizations, people, companies, sectors, policies.
// ============================================================================

import { callGemini } from '@/lib/ai/gemini'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ExtractedEntity {
  mention: string
  canonicalName: string
  entityType: 'country' | 'organization' | 'person' | 'company' | 'sector' | 'market' | 'policy' | 'commodity' | 'location'
  confidence: number
  canonicalId?: string
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[]
  keywords: string[]
  regions: string[]
  sectors: string[]
}

export async function extractEntities(
  title: string,
  summary: string,
): Promise<EntityExtractionResult> {
  const prompt = `Extrais les entités nommées et mots-clés de ce texte.

Titre: ${title}
Résumé: ${summary}

Retourne un JSON strict:
{
  "entities": [
    {"mention": "nom exact dans le texte", "canonicalName": "nom standard", "entityType": "country|organization|person|company|sector|market|policy|commodity|location", "confidence": 0.0-1.0}
  ],
  "keywords": ["mot-clé1", "mot-clé2"],
  "regions": ["région1"],
  "sectors": ["secteur1"]
}

Règles:
- entityType doit être l'un de: country, organization, person, company, sector, market, policy, commodity, location
- confidence entre 0 et 1
- keywords: 3-8 mots-clés thématiques
- regions: pays ou régions géographiques mentionnés
- sectors: secteurs économiques mentionnés
Retourne uniquement le JSON.`

  try {
    const { text } = await callGemini(prompt, { temperature: 0.1, maxOutputTokens: 1500 })
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { entities: [], keywords: [], regions: [], sectors: [] }

    const parsed = JSON.parse(jsonMatch[0])
    return {
      entities: (parsed.entities ?? []).map((e: any) => ({
        mention: e.mention ?? '',
        canonicalName: e.canonicalName ?? e.mention ?? '',
        entityType: e.entityType ?? 'organization',
        confidence: Math.min(Math.max(e.confidence ?? 0.5, 0), 1),
      })),
      keywords: parsed.keywords ?? [],
      regions: parsed.regions ?? [],
      sectors: parsed.sectors ?? [],
    }
  } catch (err) {
    console.warn('[entity-resolution] Extraction failed:', err)
    return { entities: [], keywords: [], regions: [], sectors: [] }
  }
}

export async function resolveEntityToCanonical(
  entity: ExtractedEntity,
): Promise<ExtractedEntity> {
  const db = createAdminClient()

  // Check existing intel_entities by canonical name
  const { data: existing } = await db
    .from('intel_entities')
    .select('id, canonical_name, entity_type')
    .ilike('canonical_name', `%${entity.canonicalName}%`)
    .limit(5)

  if (existing && existing.length > 0) {
    // Find best match
    const exactMatch = existing.find(
      e => e.canonical_name.toLowerCase() === entity.canonicalName.toLowerCase()
    )
    if (exactMatch) {
      return { ...entity, canonicalId: exactMatch.id, canonicalName: exactMatch.canonical_name }
    }

    // Check aliases
    const { data: aliases } = await db
      .from('entity_aliases')
      .select('entity_id, alias')
      .ilike('alias', `%${entity.canonicalName}%`)
      .limit(5)

    if (aliases && aliases.length > 0) {
      const aliasMatch = aliases.find(
        a => a.alias.toLowerCase() === entity.canonicalName.toLowerCase()
      )
      if (aliasMatch) {
        const matched = existing.find(e => e.id === aliasMatch.entity_id)
        if (matched) {
          return { ...entity, canonicalId: matched.id, canonicalName: matched.canonical_name }
        }
      }
    }

    // Use first fuzzy match
    return { ...entity, canonicalId: existing[0].id, canonicalName: existing[0].canonical_name }
  }

  return entity
}

export async function resolveEntities(
  entities: ExtractedEntity[],
): Promise<ExtractedEntity[]> {
  return Promise.all(entities.map(resolveEntityToCanonical))
}
