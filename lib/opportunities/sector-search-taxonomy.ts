/**
 * Taxonomie pour la recherche sectorielle d'opportunités.
 *
 * Pour chaque secteur : query templates, types de signaux,
 * synonymes métier, entités cibles.
 */

import { countryName } from '@/lib/countries'

export interface SectorSearchProfile {
  key: string
  label: string
  signalTypes: string[]
  queryTemplates: string[]
  synonyms: string[]
  entityTypes: string[]
  subSectors: string[]
}

export const SECTOR_SEARCH_PROFILES: SectorSearchProfile[] = [
  {
    key: 'BTP',
    label: 'BTP / Construction',
    signalTypes: [
      'tender_detected', 'procurement_signal', 'project_launch',
      'new_location', 'expansion_plan', 'hiring_spike',
      'import_activity', 'partnership', 'funding_event',
    ],
    queryTemplates: [
      'appels d\'offres BTP {country} {year}',
      'marchés publics construction {country} {year}',
      'projet infrastructure {country} {year}',
      'chantier en cours {country} {year}',
      'recrutement construction {country} {year}',
      'avis de consultation travaux {country} {year}',
      'extension usine {country} construction {year}',
      'projet route pont logement {country} {year}',
      'adjudication marché travaux {country} {year}',
      'besoin sous-traitance BTP {country} {year}',
    ],
    synonyms: ['construction', 'bâtiment', 'travaux', 'infrastructure', 'génie civil', 'chantier', 'ouvrage', 'BTP'],
    entityTypes: ['Entreprise générale', 'Sous-traitant', 'Bureau d\'études', 'Maître d\'ouvrage', 'Promoteur', 'Ministère', 'Municipalité', 'Agence'],
    subSectors: ['Routes', 'Bâtiment', 'Logement', 'Infrastructure', 'Génie civil', 'Travaux publics', 'Hydraulique', 'Électrification'],
  },
  {
    key: 'Mines',
    label: 'Mines / Extraction',
    signalTypes: [
      'project_launch', 'expansion_plan', 'tender_detected',
      'procurement_signal', 'hiring_spike', 'import_activity',
      'funding_event', 'partnership', 'new_location',
    ],
    queryTemplates: [
      'projet minier {country} {year}',
      'exploration minière {country} {year}',
      'appel offres mines {country} {year}',
      'permis exploitation {country} mine {year}',
      'investissement minier {country} {year}',
      'recrutement mine {country} {year}',
      'équipement minier {country} {year}',
      'nouveau gisement {country} {year}',
    ],
    synonyms: ['mine', 'minier', 'extraction', 'exploration', 'forage', 'minerai', 'carrière', 'gisement', 'or', 'manganèse', 'bauxite'],
    entityTypes: ['Exploitant minier', 'EPCM', 'Junior minier', 'Sous-traitant minier', 'Fournisseur', 'Laboratoire', 'Ministère des Mines'],
    subSectors: ['Or', 'Manganèse', 'Bauxite', 'Fer', 'Diamant', 'Pétrole', 'Charbon', 'Ciment'],
  },
  {
    key: 'Agriculture',
    label: 'Agriculture / Agro-industrie',
    signalTypes: [
      'expansion_plan', 'project_launch', 'funding_event',
      'new_location', 'procurement_signal', 'hiring_spike',
      'partnership', 'import_activity',
    ],
    queryTemplates: [
      'projet agro-industrie {country} {year}',
      'investissement agricole {country} {year}',
      'appel offres agriculture {country} {year}',
      'nouvelle usine transformation {country} agro {year}',
      'extension plantation {country} {year}',
      'marché intrants agricoles {country} {year}',
      'programme développement rural {country} {year}',
      'partenariat agro {country} {year}',
    ],
    synonyms: ['agricole', 'agro', 'plantation', 'récolte', 'transformation', 'semence', 'engrais', 'élevage', 'cacao', 'café', 'hévéa', 'palmier'],
    entityTypes: ['Producteur', 'Transformateur', 'Coopérative', 'Exportateur', 'Distributeur intrants', 'Ministère Agriculture'],
    subSectors: ['Cacao', 'Café', 'Hévéa', 'Palmier', 'Céréales', 'Élevage', 'Pêche', 'Transformation'],
  },
  {
    key: 'Industrie',
    label: 'Industrie / Manufacturing',
    signalTypes: [
      'project_launch', 'new_location', 'expansion_plan',
      'procurement_signal', 'hiring_spike', 'import_activity',
      'tender_detected', 'partnership',
    ],
    queryTemplates: [
      'nouveau site industriel {country} {year}',
      'projet usine {country} {year}',
      'zone industrielle {country} {year}',
      'investissement industriel {country} {year}',
      'appel offres industrie {country} {year}',
      'recrutement industriel {country} {year}',
      'extension unité production {country} {year}',
    ],
    synonyms: ['usine', 'production', 'fabrication', 'industriel', 'manufacturing', 'process', 'assemblage'],
    entityTypes: ['Industriel', 'Fabricant', 'Sous-traitant', 'Zone franche', 'Développeur ZI'],
    subSectors: ['Agroalimentaire', 'Textile', 'Chimie', 'Métallurgie', 'Emballage', 'Ciment', 'Plastique'],
  },
  {
    key: 'Distribution',
    label: 'Distribution / Commerce',
    signalTypes: [
      'expansion_plan', 'new_location', 'partnership',
      'procurement_signal', 'hiring_spike', 'import_activity',
      'funding_event',
    ],
    queryTemplates: [
      'ouverture magasin {country} {year}',
      'expansion distribution {country} {year}',
      'nouveau distributeur {country} {year}',
      'appel offres fourniture {country} {year}',
      'import export {country} {year} commerce',
      'franchise {country} {year}',
    ],
    synonyms: ['distribution', 'commerce', 'grossiste', 'détail', 'import', 'export', 'supply chain', 'franchise'],
    entityTypes: ['Grossiste', 'Distributeur', 'Importateur', 'Détaillant', 'Franchise'],
    subSectors: ['FMCG', 'Matériaux', 'Équipements', 'Alimentaire', 'Électroménager'],
  },
  {
    key: 'Énergie',
    label: 'Énergie',
    signalTypes: [
      'project_launch', 'tender_detected', 'funding_event',
      'expansion_plan', 'procurement_signal', 'new_location',
      'partnership', 'hiring_spike',
    ],
    queryTemplates: [
      'projet énergie {country} {year}',
      'appel offres énergie {country} {year}',
      'centrale solaire {country} {year}',
      'projet électrification {country} {year}',
      'investissement énergie renouvelable {country} {year}',
      'réseau électrique extension {country} {year}',
      'production pétrole gaz {country} {year}',
    ],
    synonyms: ['énergie', 'solaire', 'électrique', 'centrale', 'renouvelable', 'pétrole', 'gaz', 'barrage', 'éolien'],
    entityTypes: ['Producteur', 'Développeur', 'EPC', 'Distributeur énergie', 'Régulateur', 'IPP'],
    subSectors: ['Solaire', 'Hydro', 'Thermique', 'Éolien', 'Pétrole', 'Gaz', 'Biomasse'],
  },
  {
    key: 'Santé',
    label: 'Santé / Pharma',
    signalTypes: [
      'tender_detected', 'new_location', 'funding_event',
      'project_launch', 'procurement_signal', 'expansion_plan',
      'partnership', 'hiring_spike',
    ],
    queryTemplates: [
      'appel offres santé {country} {year}',
      'projet hôpital {country} {year}',
      'marché équipement médical {country} {year}',
      'programme santé publique {country} {year}',
      'construction clinique {country} {year}',
      'fourniture pharmaceutique {country} {year}',
      'investissement santé {country} {year}',
    ],
    synonyms: ['santé', 'médical', 'hôpital', 'pharma', 'clinique', 'dispositif médical', 'laboratoire'],
    entityTypes: ['Hôpital', 'Clinique', 'Laboratoire', 'Distributeur médical', 'Ministère Santé', 'ONG santé'],
    subSectors: ['Hôpitaux', 'Pharma', 'Diagnostic', 'Équipement médical', 'Santé digitale'],
  },
  {
    key: 'Tech',
    label: 'Technologie / Digital',
    signalTypes: [
      'funding_event', 'hiring_spike', 'expansion_plan',
      'partnership', 'project_launch', 'tender_detected',
      'procurement_signal',
    ],
    queryTemplates: [
      'startup tech {country} levée {year}',
      'projet digitalisation {country} {year}',
      'appel offres IT {country} {year}',
      'investissement tech {country} {year}',
      'recrutement tech {country} {year}',
      'partenariat tech {country} {year}',
    ],
    synonyms: ['tech', 'digital', 'logiciel', 'SaaS', 'fintech', 'startup', 'IA', 'cloud', 'data'],
    entityTypes: ['Startup', 'Scale-up', 'ESN', 'Éditeur', 'Intégrateur'],
    subSectors: ['Fintech', 'Agritech', 'Healthtech', 'Edtech', 'SaaS', 'Cloud', 'IA'],
  },
]

export const SECTOR_SEARCH_MAP = new Map(SECTOR_SEARCH_PROFILES.map(s => [s.key, s]))

export function getSectorSearchProfile(sector: string): SectorSearchProfile | undefined {
  return SECTOR_SEARCH_MAP.get(sector) ?? SECTOR_SEARCH_PROFILES.find(s =>
    s.label.toLowerCase().includes(sector.toLowerCase()) ||
    s.synonyms.some(syn => sector.toLowerCase().includes(syn.toLowerCase()))
  )
}

/**
 * Build search queries for a sector + country combination.
 */
export function buildSectorQueries(
  sector: string,
  country: string,
  options: {
    subSector?: string
    keywords?: string[]
    opportunityTypes?: string[]
    dateRangeDays?: number
  } = {},
): string[] {
  const profile = getSectorSearchProfile(sector)
  if (!profile) return []

  const year = new Date().getFullYear()
  const countryLabel = countryName(country) || country

  const queries: string[] = []

  // Base queries from templates
  for (const tpl of profile.queryTemplates) {
    queries.push(tpl.replace('{country}', countryLabel).replace('{year}', String(year)))
  }

  // Sub-sector specific queries
  if (options.subSector) {
    queries.push(`${options.subSector} ${countryLabel} ${year} projets opportunités`)
    queries.push(`appel offres ${options.subSector} ${countryLabel} ${year}`)
  }

  // Custom keywords
  if (options.keywords?.length) {
    const kwStr = options.keywords.join(' ')
    queries.push(`${kwStr} ${countryLabel} ${year}`)
    queries.push(`${kwStr} ${profile.label} ${countryLabel} ${year}`)
  }

  // Opportunity type specific queries
  if (options.opportunityTypes?.length) {
    for (const type of options.opportunityTypes.slice(0, 3)) {
      const label = OPPORTUNITY_TYPE_LABELS[type]
      if (label) {
        queries.push(`${label} ${profile.label} ${countryLabel} ${year}`)
      }
    }
  }

  return queries.slice(0, 15)
}

export const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  tender_detected: 'appel d\'offres',
  procurement_signal: 'marché public',
  project_launch: 'nouveau projet',
  new_location: 'nouveau site',
  expansion_plan: 'extension expansion',
  hiring_spike: 'recrutement massif',
  import_activity: 'achat import logistique',
  partnership: 'partenariat contrat',
  funding_event: 'investissement financement',
  construction_start: 'démarrage chantier',
  subcontracting_need: 'sous-traitance',
  equipment_need: 'besoin équipement',
}

export const SEARCHABLE_SECTORS = SECTOR_SEARCH_PROFILES.map(s => ({
  key: s.key,
  label: s.label,
  subSectors: s.subSectors,
}))
