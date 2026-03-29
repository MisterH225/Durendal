/**
 * Taxonomie des signaux commerciaux
 *
 * Chaque type de signal a un score de base, une demi-vie (decay en jours),
 * un seuil de confiance minimum et un mapping vers des angles d'approche.
 */

export interface SignalTypeConfig {
  type: string
  label: string
  description: string
  baseScore: number
  decayDays: number
  minConfidence: number
  sectors: string[]       // [] = tous les secteurs
  approachAngle: string
  category: 'high_intent' | 'medium_intent' | 'low_intent' | 'context'
}

export const SIGNAL_TYPES: SignalTypeConfig[] = [
  {
    type: 'tender_detected',
    label: 'Appel d\'offres détecté',
    description: 'Un appel d\'offres ou marché public a été identifié',
    baseScore: 30,
    decayDays: 30,
    minConfidence: 0.4,
    sectors: [],
    approachAngle: 'Répondre à l\'appel d\'offres ou proposer un partenariat de soumission',
    category: 'high_intent',
  },
  {
    type: 'project_launch',
    label: 'Lancement de projet',
    description: 'Un nouveau projet majeur a été annoncé',
    baseScore: 25,
    decayDays: 45,
    minConfidence: 0.4,
    sectors: [],
    approachAngle: 'Proposer vos solutions pour le projet en cours de lancement',
    category: 'high_intent',
  },
  {
    type: 'expansion_plan',
    label: 'Plan d\'expansion',
    description: 'L\'entreprise annonce une expansion géographique ou sectorielle',
    baseScore: 20,
    decayDays: 60,
    minConfidence: 0.3,
    sectors: [],
    approachAngle: 'Accompagner la montée en charge liée à l\'expansion',
    category: 'medium_intent',
  },
  {
    type: 'hiring_spike',
    label: 'Pic de recrutement',
    description: 'Vague de recrutements significative détectée',
    baseScore: 15,
    decayDays: 30,
    minConfidence: 0.3,
    sectors: [],
    approachAngle: 'Proposer des solutions d\'accompagnement pour la montée en charge RH',
    category: 'medium_intent',
  },
  {
    type: 'executive_change',
    label: 'Changement de direction',
    description: 'Nomination ou départ d\'un dirigeant clé',
    baseScore: 10,
    decayDays: 45,
    minConfidence: 0.5,
    sectors: [],
    approachAngle: 'Approcher le nouveau décideur avec une proposition adaptée',
    category: 'context',
  },
  {
    type: 'partnership',
    label: 'Partenariat annoncé',
    description: 'Nouveau partenariat stratégique détecté',
    baseScore: 12,
    decayDays: 45,
    minConfidence: 0.4,
    sectors: [],
    approachAngle: 'Proposer une valeur complémentaire au partenariat annoncé',
    category: 'medium_intent',
  },
  {
    type: 'distributor_appointment',
    label: 'Nomination de distributeur',
    description: 'Un nouveau distributeur ou agent a été nommé',
    baseScore: 15,
    decayDays: 30,
    minConfidence: 0.4,
    sectors: ['Distribution', 'Industrie', 'Agriculture'],
    approachAngle: 'Proposer vos produits/services au nouveau réseau de distribution',
    category: 'medium_intent',
  },
  {
    type: 'import_activity',
    label: 'Activité d\'importation',
    description: 'Importation significative de matériel ou matières premières',
    baseScore: 18,
    decayDays: 30,
    minConfidence: 0.3,
    sectors: ['BTP', 'Mines', 'Industrie', 'Agriculture'],
    approachAngle: 'Proposer des alternatives locales ou des services logistiques',
    category: 'high_intent',
  },
  {
    type: 'funding_event',
    label: 'Levée de fonds',
    description: 'Tour de table, financement projet ou subvention',
    baseScore: 22,
    decayDays: 60,
    minConfidence: 0.5,
    sectors: [],
    approachAngle: 'Proposer vos solutions pour déployer les fonds levés',
    category: 'high_intent',
  },
  {
    type: 'product_launch',
    label: 'Lancement produit',
    description: 'Nouveau produit ou service lancé',
    baseScore: 14,
    decayDays: 45,
    minConfidence: 0.4,
    sectors: [],
    approachAngle: 'Proposer des services complémentaires au nouveau produit',
    category: 'medium_intent',
  },
  {
    type: 'new_location',
    label: 'Nouveau site / bureau',
    description: 'Ouverture d\'un nouveau site, bureau ou usine',
    baseScore: 20,
    decayDays: 60,
    minConfidence: 0.4,
    sectors: [],
    approachAngle: 'Équiper ou accompagner le nouveau site',
    category: 'high_intent',
  },
  {
    type: 'procurement_signal',
    label: 'Signal d\'achat',
    description: 'Intention d\'achat ou processus de procurement détecté',
    baseScore: 28,
    decayDays: 21,
    minConfidence: 0.4,
    sectors: [],
    approachAngle: 'Répondre directement au besoin d\'achat identifié',
    category: 'high_intent',
  },
  {
    type: 'competitor_switch',
    label: 'Changement de fournisseur',
    description: 'L\'entreprise change ou évalue de nouveaux fournisseurs',
    baseScore: 18,
    decayDays: 30,
    minConfidence: 0.3,
    sectors: [],
    approachAngle: 'Proposer une alternative au fournisseur sortant',
    category: 'high_intent',
  },
  {
    type: 'compliance_event',
    label: 'Événement réglementaire',
    description: 'Nouvelle réglementation ou mise en conformité',
    baseScore: 12,
    decayDays: 90,
    minConfidence: 0.4,
    sectors: [],
    approachAngle: 'Accompagner la mise en conformité réglementaire',
    category: 'context',
  },
  {
    type: 'digital_activity_spike',
    label: 'Activité digitale',
    description: 'Pic d\'activité en ligne détecté',
    baseScore: 8,
    decayDays: 14,
    minConfidence: 0.2,
    sectors: [],
    approachAngle: 'Proposer des solutions digitales adaptées',
    category: 'low_intent',
  },
]

export const SIGNAL_TYPE_MAP = new Map(SIGNAL_TYPES.map(s => [s.type, s]))

export function getSignalConfig(type: string): SignalTypeConfig | undefined {
  return SIGNAL_TYPE_MAP.get(type)
}

export function getSignalBaseScore(type: string): number {
  return SIGNAL_TYPE_MAP.get(type)?.baseScore ?? 10
}

export function getSignalApproachAngle(type: string): string {
  return SIGNAL_TYPE_MAP.get(type)?.approachAngle ?? 'Approche généraliste basée sur le signal détecté'
}
