/**
 * Configuration sectorielle pour le scoring et les angles d'approche.
 *
 * Chaque verticale définit ses signaux prioritaires, poids additionnels,
 * types de comptes privilégiés et exemples de messages.
 */

export interface SectorConfig {
  key: string
  label: string
  prioritySignals: string[]
  bonusWeight: number
  accountTypes: string[]
  approachExamples: string[]
  keywords: string[]
}

export const SECTOR_CONFIGS: SectorConfig[] = [
  {
    key: 'BTP',
    label: 'BTP / Construction',
    prioritySignals: ['tender_detected', 'project_launch', 'new_location', 'import_activity', 'procurement_signal'],
    bonusWeight: 1.3,
    accountTypes: ['Entreprise générale', 'Sous-traitant', 'Bureau d\'études', 'Promoteur', 'Maître d\'ouvrage'],
    approachExamples: [
      'Optimisation des achats matériaux pour le chantier détecté',
      'Accompagnement logistique pour le nouveau projet',
      'Solutions de sous-traitance spécialisée',
    ],
    keywords: ['chantier', 'construction', 'bâtiment', 'travaux', 'infrastructure', 'génie civil', 'béton', 'ciment'],
  },
  {
    key: 'Mines',
    label: 'Mines / Extraction',
    prioritySignals: ['project_launch', 'expansion_plan', 'import_activity', 'hiring_spike', 'procurement_signal'],
    bonusWeight: 1.3,
    accountTypes: ['Exploitant minier', 'EPCM', 'Sous-traitant minier', 'Fournisseur équipements', 'Laboratoire'],
    approachExamples: [
      'Fourniture équipements pour l\'extension de site',
      'Solutions logistiques pour le nouveau permis',
      'Services techniques pour la phase de faisabilité',
    ],
    keywords: ['mine', 'minier', 'extraction', 'exploration', 'forage', 'minerai', 'carrière', 'EPCM'],
  },
  {
    key: 'Agriculture',
    label: 'Agriculture / Agro-industrie',
    prioritySignals: ['expansion_plan', 'product_launch', 'distributor_appointment', 'funding_event', 'new_location'],
    bonusWeight: 1.2,
    accountTypes: ['Producteur', 'Transformateur', 'Distributeur', 'Coopérative', 'Exportateur'],
    approachExamples: [
      'Solutions pour la nouvelle ligne de transformation',
      'Accompagnement certification / qualité',
      'Réseau de distribution complémentaire',
    ],
    keywords: ['agricole', 'agro', 'culture', 'récolte', 'transformation', 'semence', 'engrais', 'élevage'],
  },
  {
    key: 'Industrie',
    label: 'Industrie / Manufacturing',
    prioritySignals: ['project_launch', 'new_location', 'import_activity', 'procurement_signal', 'hiring_spike'],
    bonusWeight: 1.2,
    accountTypes: ['Industriel', 'Fabricant', 'Sous-traitant', 'Intégrateur', 'Mainteneur'],
    approachExamples: [
      'Équipements industriels pour la nouvelle unité',
      'Maintenance et pièces détachées',
      'Automatisation des process',
    ],
    keywords: ['usine', 'production', 'fabrication', 'industriel', 'manufacturing', 'ligne de production'],
  },
  {
    key: 'Distribution',
    label: 'Distribution / Commerce',
    prioritySignals: ['expansion_plan', 'distributor_appointment', 'new_location', 'partnership', 'product_launch'],
    bonusWeight: 1.1,
    accountTypes: ['Grossiste', 'Distributeur', 'Détaillant', 'Importateur', 'E-commerçant'],
    approachExamples: [
      'Gamme produit pour le nouveau point de vente',
      'Partenariat de distribution exclusive',
      'Solutions logistique / supply chain',
    ],
    keywords: ['distribution', 'commerce', 'vente', 'grossiste', 'détail', 'import', 'supply chain'],
  },
  {
    key: 'Énergie',
    label: 'Énergie',
    prioritySignals: ['project_launch', 'tender_detected', 'funding_event', 'compliance_event', 'expansion_plan'],
    bonusWeight: 1.3,
    accountTypes: ['Producteur énergie', 'Développeur', 'EPC', 'Distributeur', 'Régulateur'],
    approachExamples: [
      'Solutions pour le projet énergie renouvelable',
      'Équipements pour la nouvelle centrale',
      'Services d\'ingénierie et maintenance',
    ],
    keywords: ['énergie', 'solaire', 'électrique', 'centrale', 'renouvelable', 'pétrole', 'gaz'],
  },
  {
    key: 'Santé',
    label: 'Santé / Pharma',
    prioritySignals: ['tender_detected', 'new_location', 'compliance_event', 'funding_event', 'product_launch'],
    bonusWeight: 1.2,
    accountTypes: ['Hôpital', 'Clinique', 'Laboratoire', 'Distributeur médical', 'Pharma'],
    approachExamples: [
      'Équipements médicaux pour le nouvel établissement',
      'Fournitures pharmaceutiques',
      'Solutions de conformité sanitaire',
    ],
    keywords: ['santé', 'médical', 'hôpital', 'pharma', 'clinique', 'dispositif médical'],
  },
  {
    key: 'Tech',
    label: 'Technologie / Digital',
    prioritySignals: ['funding_event', 'hiring_spike', 'expansion_plan', 'partnership', 'product_launch'],
    bonusWeight: 1.1,
    accountTypes: ['Startup', 'Scale-up', 'Éditeur SaaS', 'ESN', 'Intégrateur'],
    approachExamples: [
      'Solutions complémentaires post-levée de fonds',
      'Partenariat tech pour l\'expansion',
      'Intégration avec votre stack existante',
    ],
    keywords: ['tech', 'digital', 'logiciel', 'SaaS', 'fintech', 'startup', 'développement', 'IA'],
  },
  {
    key: 'Télécom',
    label: 'Télécommunications',
    prioritySignals: ['expansion_plan', 'tender_detected', 'new_location', 'partnership', 'procurement_signal'],
    bonusWeight: 1.2,
    accountTypes: ['Opérateur', 'Équipementier', 'Towerco', 'MVNO', 'ISP'],
    approachExamples: [
      'Équipements réseau pour le déploiement',
      'Solutions d\'infrastructure telecom',
      'Services de maintenance réseau',
    ],
    keywords: ['télécom', 'réseau', 'mobile', 'fibre', 'antenne', 'opérateur', '5G', '4G'],
  },
  {
    key: 'Banque',
    label: 'Banque / Assurance / Finance',
    prioritySignals: ['expansion_plan', 'product_launch', 'compliance_event', 'digital_activity_spike', 'executive_change'],
    bonusWeight: 1.1,
    accountTypes: ['Banque', 'Assureur', 'Microfinance', 'Fintech', 'Courtier'],
    approachExamples: [
      'Solutions digitales pour la nouvelle agence',
      'Accompagnement conformité réglementaire',
      'Innovation produit financier',
    ],
    keywords: ['banque', 'finance', 'assurance', 'crédit', 'prêt', 'épargne', 'fintech'],
  },
]

export const SECTOR_MAP = new Map(SECTOR_CONFIGS.map(s => [s.key, s]))

export function getSectorConfig(sector: string): SectorConfig | undefined {
  return SECTOR_MAP.get(sector) ?? SECTOR_CONFIGS.find(s =>
    s.label.toLowerCase().includes(sector.toLowerCase()) ||
    s.keywords.some(k => sector.toLowerCase().includes(k))
  )
}

export function isSectorPrioritySignal(sector: string, signalType: string): boolean {
  const cfg = getSectorConfig(sector)
  return cfg?.prioritySignals.includes(signalType) ?? false
}
