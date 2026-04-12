import type { SourceAdapter } from '../adapter'
import type { ProviderId } from '../types'
import { NewsDataAdapter } from './newsdata'
import { FinlightAdapter } from './finlight'
import { GdeltAdapter } from './gdelt'
import { PolymarketAdapter } from './polymarket'
import { DomeAdapter } from './dome'
import { PerplexityAdapter } from './perplexity'

const registry = new Map<ProviderId, SourceAdapter>([
  ['newsdata', new NewsDataAdapter()],
  ['finlight', new FinlightAdapter()],
  ['gdelt', new GdeltAdapter()],
  ['polymarket', new PolymarketAdapter()],
  ['dome', new DomeAdapter()],
  ['perplexity', new PerplexityAdapter()],
])

export function getAdapter(id: ProviderId): SourceAdapter {
  const a = registry.get(id)
  if (!a) throw new Error(`Unknown provider: ${id}`)
  return a
}

export function getAllAdapters(): SourceAdapter[] {
  return [...registry.values()]
}

export function getNewsAdapters(): SourceAdapter[] {
  return [...registry.values()].filter(a => a.capabilities.supports_news)
}

export function getMarketAdapters(): SourceAdapter[] {
  return [...registry.values()].filter(a => a.capabilities.supports_markets)
}
