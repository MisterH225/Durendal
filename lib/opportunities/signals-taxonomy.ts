/**
 * Taxonomie des signaux commerciaux
 *
 * Chaque type de signal a :
 * - un score de base, une demi-vie (decay en jours),
 * - un seuil de confiance minimum,
 * - un mapping vers des angles d'approche,
 * - un libellé métier (businessLabel) lisible par un commercial,
 * - un template d'hypothèse business,
 * - un badge UI court.
 */

export interface SignalTypeConfig {
  type: string
  label: string
  businessLabel: string
  badge: string
  description: string
  hypothesisTemplate: string
  baseScore: number
  decayDays: number
  minConfidence: number
  sectors: string[]
  approachAngle: string
  category: 'high_intent' | 'medium_intent' | 'low_intent' | 'context'
}

export const SIGNAL_TYPES: SignalTypeConfig[] = [
  {
    type: 'tender_detected',
    label: 'Appel d\'offres détecté',
    businessLabel: 'Appel d\'offres détecté',
    badge: 'Appel d\'offres',
    description: 'Un appel d\'offres ou marché public a été identifié',
    hypothesisTemplate: 'L\'entreprise a publié ou est ciblée par un appel d\'offres, signalant un besoin concret et budgétisé à court terme.',
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
    businessLabel: 'Nouveau projet ou chantier détecté',
    badge: 'Projet',
    description: 'Un nouveau projet majeur a été annoncé',
    hypothesisTemplate: 'L\'entreprise lance un projet de grande envergure pouvant générer des besoins en équipements, services ou sous-traitance.',
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
    businessLabel: 'Expansion ou montée en charge détectée',
    badge: 'Expansion',
    description: 'L\'entreprise annonce une expansion géographique ou sectorielle',
    hypothesisTemplate: 'L\'entreprise semble entrer dans une phase de croissance ou d\'expansion pouvant générer des besoins opérationnels importants.',
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
    businessLabel: 'Recrutement massif en cours',
    badge: 'Recrutement',
    description: 'Vague de recrutements significative détectée',
    hypothesisTemplate: 'L\'entreprise recrute activement, suggérant une montée en charge opérationnelle, un nouveau contrat ou une expansion interne.',
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
    businessLabel: 'Nouveau décideur en poste',
    badge: 'Décideur',
    description: 'Nomination ou départ d\'un dirigeant clé',
    hypothesisTemplate: 'Un changement à la direction peut signifier une réévaluation des fournisseurs et partenaires en place.',
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
    businessLabel: 'Partenariat stratégique détecté',
    badge: 'Partenariat',
    description: 'Nouveau partenariat stratégique détecté',
    hypothesisTemplate: 'Un nouveau partenariat peut créer des besoins complémentaires en produits, services ou accompagnement.',
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
    businessLabel: 'Nouveau réseau de distribution',
    badge: 'Distribution',
    description: 'Un nouveau distributeur ou agent a été nommé',
    hypothesisTemplate: 'La nomination d\'un nouveau distributeur signale une volonté de pénétration de marché nécessitant un accompagnement.',
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
    businessLabel: 'Hausse probable des besoins d\'équipement ou logistique',
    badge: 'Logistique',
    description: 'Importation significative de matériel ou matières premières',
    hypothesisTemplate: 'L\'activité d\'importation suggère un besoin d\'équipement, de matériaux ou de services logistiques à court terme.',
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
    businessLabel: 'Capacité d\'investissement renforcée',
    badge: 'Levée de fonds',
    description: 'Tour de table, financement projet ou subvention',
    hypothesisTemplate: 'L\'entreprise dispose de nouveaux moyens financiers, augmentant sa capacité à investir dans de nouveaux projets ou partenariats.',
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
    businessLabel: 'Nouveau produit ou service lancé',
    badge: 'Produit',
    description: 'Nouveau produit ou service lancé',
    hypothesisTemplate: 'Le lancement d\'un nouveau produit peut créer des besoins en infrastructure, marketing, distribution ou support.',
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
    businessLabel: 'Ouverture probable d\'un nouveau site',
    badge: 'Nouveau site',
    description: 'Ouverture d\'un nouveau site, bureau ou usine',
    hypothesisTemplate: 'L\'ouverture d\'un nouveau site génère des besoins importants en équipement, aménagement et services.',
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
    businessLabel: 'Besoin d\'achat ou de consultation détecté',
    badge: 'Achat',
    description: 'Intention d\'achat ou processus de procurement détecté',
    hypothesisTemplate: 'L\'entreprise semble préparer un achat ou une consultation fournisseur, signalant un besoin concret à adresser.',
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
    businessLabel: 'Changement de fournisseur ou repositionnement possible',
    badge: 'Fournisseur',
    description: 'L\'entreprise change ou évalue de nouveaux fournisseurs',
    hypothesisTemplate: 'Un changement ou une insatisfaction fournisseur crée une fenêtre d\'approche pour proposer une alternative.',
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
    businessLabel: 'Nouvelle obligation réglementaire détectée',
    badge: 'Conformité',
    description: 'Nouvelle réglementation ou mise en conformité',
    hypothesisTemplate: 'Une nouvelle réglementation peut contraindre l\'entreprise à investir dans des mises aux normes ou de nouveaux équipements.',
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
    businessLabel: 'Pic d\'activité en ligne détecté',
    badge: 'Digital',
    description: 'Pic d\'activité en ligne détecté',
    hypothesisTemplate: 'Une hausse de l\'activité en ligne peut précéder un lancement, une campagne ou un besoin de transformation digitale.',
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

export function getSignalBusinessLabel(type: string): string {
  return SIGNAL_TYPE_MAP.get(type)?.businessLabel ?? 'Signal commercial détecté'
}

export function getSignalBadge(type: string): string {
  return SIGNAL_TYPE_MAP.get(type)?.badge ?? 'Signal'
}

export function getSignalHypothesisTemplate(type: string): string {
  return SIGNAL_TYPE_MAP.get(type)?.hypothesisTemplate ?? 'L\'activité détectée peut signaler un besoin commercial exploitable.'
}
