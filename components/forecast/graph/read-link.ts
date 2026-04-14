import type { IntelligenceGraphNode } from '@/lib/graph/types'

export type ReadLinkKind = 'external' | 'signal_detail' | 'signals_search'

export function signalsSearchUrl(label: string): string {
  return `/forecast/signals?q=${encodeURIComponent(label)}`
}

/**
 * URL à ouvrir pour « lire » un nœud — toujours préférer une source HTTP directe,
 * puis une fiche signal interne, puis recherche signaux (évite de quitter le graphe : ouvrir en nouvel onglet côté UI).
 */
export function resolveNodeReadTarget(node: IntelligenceGraphNode): {
  href: string
  kind: ReadLinkKind
  label: string
} {
  const meta = (node.metadata ?? {}) as Record<string, unknown>
  const platformRefType = meta.platformRefType as string | undefined
  const platformRefId = meta.platformRefId as string | undefined

  const url = node.url?.trim()
  if (url && /^https?:\/\//i.test(url)) {
    return { href: url, kind: 'external', label: 'Ouvrir la source' }
  }

  if (
    platformRefId &&
    (platformRefType === 'signal' || platformRefType === 'external_signal')
  ) {
    return {
      href: `/forecast/signals/${platformRefId}`,
      kind: 'signal_detail',
      label: 'Voir le signal',
    }
  }

  return {
    href: signalsSearchUrl(node.label),
    kind: 'signals_search',
    label: 'Rechercher dans les signaux',
  }
}
