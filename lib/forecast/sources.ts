export type SourceTier = 1 | 2 | 3

export interface ForecastSource {
  name:     string
  url:      string
  tier:     SourceTier
  bestFor:  string[]   // channel slugs
  why:      string
}

export const FORECAST_SOURCES: ForecastSource[] = [
  // ── Tier 1 : Primary official sources ─────────────────────────────────────
  {
    name:    'World Bank Open Data',
    url:     'https://data.worldbank.org',
    tier:    1,
    bestFor: ['macro-commodities', 'agriculture-risk', 'regional-business-events'],
    why:     'Global institution with standardized country-level data and long historical coverage.',
  },
  {
    name:    'IMF Data',
    url:     'https://www.imf.org/en/Data',
    tier:    1,
    bestFor: ['macro-commodities', 'politics-policy', 'climate'],
    why:     'Timely macroeconomic datasets and country surveillance reports.',
  },
  {
    name:    'FAOSTAT',
    url:     'https://www.fao.org/faostat',
    tier:    1,
    bestFor: ['agriculture-risk'],
    why:     'Core international agriculture database with broad country coverage.',
  },
  {
    name:    'Election Commission websites',
    url:     '',
    tier:    1,
    bestFor: ['politics-policy'],
    why:     'Primary source for legally authoritative election outcomes and dates.',
  },
  {
    name:    'Central bank websites',
    url:     '',
    tier:    1,
    bestFor: ['politics-policy', 'macro-commodities'],
    why:     'Primary source for monetary policy and exchange-rate announcements.',
  },
  {
    name:    'Ministry of Finance / Economy websites',
    url:     '',
    tier:    1,
    bestFor: ['politics-policy', 'regional-business-events'],
    why:     'Primary source for official economic policy actions and fiscal releases.',
  },
  {
    name:    'National statistics offices',
    url:     '',
    tier:    1,
    bestFor: ['macro-commodities', 'agriculture-risk', 'logistics'],
    why:     'Primary official source for CPI, GDP, trade, and sector indicators.',
  },

  // ── Tier 2 : Structured international analysis ─────────────────────────────
  {
    name:    'OECD-FAO Agricultural Outlook',
    url:     'https://www.oecd-ilibrary.org/agriculture-and-food/oecd-fao-agricultural-outlook_agr_outlook-en',
    tier:    2,
    bestFor: ['agriculture-risk'],
    why:     'Forward-looking analysis built with country and commodity expertise.',
  },
  {
    name:    'USDA Economic Research Service',
    url:     'https://www.ers.usda.gov',
    tier:    2,
    bestFor: ['agriculture-risk', 'macro-commodities'],
    why:     'High-quality analytical datasets and long-run agricultural projections.',
  },
  {
    name:    'OECD iLibrary',
    url:     'https://www.oecd-ilibrary.org',
    tier:    2,
    bestFor: ['politics-policy', 'macro-commodities', 'logistics', 'climate'],
    why:     'Multilateral source for structured data and policy analysis.',
  },
  {
    name:    'Eurostat',
    url:     'https://ec.europa.eu/eurostat',
    tier:    2,
    bestFor: ['macro-commodities', 'logistics', 'agriculture-risk'],
    why:     'Official statistical source for EU data across multiple sectors.',
  },
  {
    name:    'IEA (International Energy Agency)',
    url:     'https://www.iea.org',
    tier:    2,
    bestFor: ['climate', 'macro-commodities'],
    why:     'Widely trusted for energy market and policy intelligence.',
  },
  {
    name:    'International Transport Forum',
    url:     'https://www.itf-oecd.org',
    tier:    2,
    bestFor: ['logistics'],
    why:     'Recognized transport policy body connected to OECD data ecosystem.',
  },
  {
    name:    'UN Comtrade',
    url:     'https://comtradeplus.un.org',
    tier:    2,
    bestFor: ['logistics', 'macro-commodities', 'agriculture-risk'],
    why:     'Standard international trade database for import/export analysis.',
  },

  // ── Tier 3 : Specialist commercial intelligence ─────────────────────────────
  {
    name:    'Argus Media',
    url:     'https://www.argusmedia.com',
    tier:    3,
    bestFor: ['macro-commodities'],
    why:     'Specialist commodity publisher with strong price-discovery reputation.',
  },
  {
    name:    'FiscalNote',
    url:     'https://fiscalnote.com',
    tier:    3,
    bestFor: ['politics-policy'],
    why:     'Useful specialist source for policy tracking and regulatory developments.',
  },
  {
    name:    'ISI Markets',
    url:     'https://www.isimarkets.com',
    tier:    3,
    bestFor: ['regional-business-events', 'macro-commodities'],
    why:     'Specialist emerging-markets information provider for frontier markets.',
  },
]

export const TIER_COLORS: Record<SourceTier, string> = {
  1: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  2: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  3: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
}

export function getSourcesForChannel(channelSlug: string): ForecastSource[] {
  return FORECAST_SOURCES.filter(s => s.bestFor.includes(channelSlug))
}
