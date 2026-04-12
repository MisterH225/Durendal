export * from './types'
export * from './adapter'
export * from './utils'
export { getAdapter, getAllAdapters, getNewsAdapters, getMarketAdapters } from './adapters'
export { runIngestion } from './engine'
export { findDedupMatch, ensureDedupGroup } from './dedup'
export { computeTrustScore, getDomainTrust } from './trust'
export {
  runNewsGeneralFlow,
  runNewsFinancialFlow,
  runEventDiscoveryFlow,
  runMarketSnapshotFlow,
} from './flows'
export { logIngestionMetric, logRunComplete, logProviderUnhealthy, logProviderError } from './observability'
