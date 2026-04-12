import type { IntelligenceGraphNode, IntelligenceGraphEdge } from './types'

// ============================================================================
// Rich mock intelligence graph — geopolitical + economic + tech scenarios
// ============================================================================

export const MOCK_NODES: IntelligenceGraphNode[] = [
  // ── Events ────────────────────────────────────────────────────────────────
  { id: 'ev-hormuz',    type: 'event',    label: 'Escalade militaire au détroit d\'Ormuz',          summary: 'Tensions croissantes entre l\'Iran et les USA autour du détroit d\'Ormuz. Incidents navals multiples, disruptions du trafic maritime.', importance: 9, createdAt: '2026-03-15', regionTags: ['Middle East'], sectorTags: ['Énergie', 'Défense'] },
  { id: 'ev-cocoa',     type: 'event',    label: 'Crise de l\'offre de cacao en Afrique de l\'Ouest', summary: 'Chute de la production de cacao en Côte d\'Ivoire et au Ghana due à la sécheresse et aux maladies. Prix spot en hausse de 40%.', importance: 8, createdAt: '2026-02-20', regionTags: ['West Africa'], sectorTags: ['Agriculture', 'Commodités'] },
  { id: 'ev-niger',     type: 'event',    label: 'Crise politique au Niger et tensions CEDEAO',      summary: 'Suite du coup d\'État de 2023. Sanctions économiques, retrait de bases militaires françaises, rapprochement avec la Russie et l\'Iran.', importance: 8, createdAt: '2026-01-10', regionTags: ['Sahel', 'West Africa'], sectorTags: ['Défense', 'Mines'] },
  { id: 'ev-ai-reg',    type: 'event',    label: 'Régulation IA — AI Act européen phase 2',          summary: 'Entrée en vigueur des obligations de conformité pour les modèles fondamentaux. Amendes potentielles de 7% du CA mondial.', importance: 7, createdAt: '2026-04-01', regionTags: ['Europe', 'USA'], sectorTags: ['Tech', 'Régulation'] },
  { id: 'ev-inflation', type: 'event',    label: 'Pression inflationniste en Afrique subsaharienne',  summary: 'Inflation à deux chiffres au Nigeria, Ghana, Kenya. Dépréciation des devises, hausse des taux directeurs.', importance: 7, createdAt: '2026-03-01', regionTags: ['West Africa', 'East Africa'], sectorTags: ['Finance', 'Commodités'] },

  // ── Entities ──────────────────────────────────────────────────────────────
  { id: 'ent-iran',     type: 'entity',   label: 'Iran',                      subtitle: 'État',                regionTags: ['Middle East'] },
  { id: 'ent-usa',      type: 'entity',   label: 'États-Unis',                subtitle: 'État',                regionTags: ['USA'] },
  { id: 'ent-israel',   type: 'entity',   label: 'Israël',                    subtitle: 'État',                regionTags: ['Middle East'] },
  { id: 'ent-cedeao',   type: 'entity',   label: 'CEDEAO / ECOWAS',          subtitle: 'Organisation régionale', regionTags: ['West Africa'] },
  { id: 'ent-niger-gov',type: 'entity',   label: 'Conseil National Niger',    subtitle: 'Gouvernement militaire', regionTags: ['Sahel'] },
  { id: 'ent-civ',      type: 'entity',   label: 'Côte d\'Ivoire',            subtitle: 'État producteur cacao', regionTags: ['West Africa'] },
  { id: 'ent-ghana',    type: 'entity',   label: 'Ghana',                     subtitle: 'État producteur cacao', regionTags: ['West Africa'] },
  { id: 'ent-opec',     type: 'entity',   label: 'OPEP',                      subtitle: 'Cartel pétrolier',    regionTags: ['Middle East'] },
  { id: 'ent-eu',       type: 'entity',   label: 'Union Européenne',          subtitle: 'Institution',         regionTags: ['Europe'] },
  { id: 'ent-openai',   type: 'entity',   label: 'OpenAI',                    subtitle: 'Entreprise IA',       regionTags: ['USA'], sectorTags: ['Tech'] },
  { id: 'ent-cbn',      type: 'entity',   label: 'CBN (Banque centrale Nigeria)', subtitle: 'Banque centrale', regionTags: ['West Africa'], sectorTags: ['Finance'] },
  { id: 'ent-wagner',   type: 'entity',   label: 'Africa Corps / Wagner',     subtitle: 'Groupe paramilitaire', regionTags: ['Sahel', 'Middle East'] },
  { id: 'ent-china',    type: 'entity',   label: 'Chine',                     subtitle: 'État',                regionTags: ['Asia'] },
  { id: 'ent-bceao',    type: 'entity',   label: 'BCEAO',                     subtitle: 'Banque centrale UEMOA', regionTags: ['West Africa'], sectorTags: ['Finance'] },
  { id: 'ent-russia',   type: 'entity',   label: 'Russie',                    subtitle: 'État',                regionTags: ['Europe'] },

  // ── Questions ─────────────────────────────────────────────────────────────
  { id: 'q-hormuz-90',  type: 'question', label: 'Incident militaire majeur au détroit d\'Ormuz dans 90 jours ?', probability: 0.38, importance: 9, regionTags: ['Middle East'], sectorTags: ['Énergie', 'Défense'] },
  { id: 'q-cocoa-150',  type: 'question', label: 'Prix du cacao > 10 000 $/t avant septembre 2026 ?',           probability: 0.52, importance: 7, regionTags: ['West Africa'], sectorTags: ['Agriculture'] },
  { id: 'q-niger-exit', type: 'question', label: 'Le Niger quitte-t-il officiellement la CEDEAO en 2026 ?',      probability: 0.65, importance: 6, regionTags: ['Sahel'], sectorTags: ['Défense'] },
  { id: 'q-ai-fine',    type: 'question', label: 'Première amende > 100M€ sous l\'AI Act avant 2027 ?',          probability: 0.28, importance: 5, regionTags: ['Europe'], sectorTags: ['Tech', 'Régulation'] },
  { id: 'q-naira',      type: 'question', label: 'Le naira nigérian dépasse 2000 NGN/USD en 2026 ?',             probability: 0.45, importance: 6, regionTags: ['West Africa'], sectorTags: ['Finance'] },
  { id: 'q-iran-deal',  type: 'question', label: 'Cessez-le-feu USA-Iran formalisé avant fin 2026 ?',            probability: 0.22, importance: 8, regionTags: ['Middle East'], sectorTags: ['Défense'] },
  { id: 'q-sahel-mine', type: 'question', label: 'Nationalisation d\'une mine majeure au Sahel en 2026 ?',        probability: 0.40, importance: 5, regionTags: ['Sahel'], sectorTags: ['Mines'] },
  { id: 'q-china-tariff',type: 'question',label: 'Nouveaux tarifs USA-Chine > 50% sur semi-conducteurs ?',        probability: 0.55, importance: 7, regionTags: ['Asia', 'USA'], sectorTags: ['Tech'] },

  // ── Articles / Signals ────────────────────────────────────────────────────
  { id: 'art-1', type: 'article', label: 'Tanker diverted after incident near Hormuz strait',             summary: 'Reuters — Un pétrolier a été dérouté suite à un incident maritime près du détroit d\'Ormuz.', createdAt: '2026-04-08', regionTags: ['Middle East'], sectorTags: ['Énergie'] },
  { id: 'art-2', type: 'article', label: 'Iran announces naval exercises in Gulf region',                 summary: 'Al Jazeera — L\'Iran annonce des exercices navals majeurs dans le Golfe persique.', createdAt: '2026-04-05', regionTags: ['Middle East'] },
  { id: 'art-3', type: 'article', label: 'Cocoa prices surge as West African supply dwindles',            summary: 'Bloomberg — Le prix du cacao atteint un record de 8 500 $/tonne.', createdAt: '2026-04-02', regionTags: ['West Africa'], sectorTags: ['Agriculture', 'Commodités'] },
  { id: 'art-4', type: 'article', label: 'Ghana reduces cocoa production forecast by 20%',                summary: 'Financial Times — Le Ghana révise à la baisse ses prévisions de production de cacao.', createdAt: '2026-03-28', regionTags: ['West Africa'], sectorTags: ['Agriculture'] },
  { id: 'art-5', type: 'article', label: 'Niger junta expands ties with Russia and Iran',                 summary: 'Le Monde — La junte nigérienne accélère ses partenariats avec Moscou et Téhéran.', createdAt: '2026-03-20', regionTags: ['Sahel', 'Middle East'] },
  { id: 'art-6', type: 'article', label: 'ECOWAS lifts some sanctions on Niger after diplomatic push',    summary: 'BBC Africa — La CEDEAO allège certaines sanctions sur le Niger.', createdAt: '2026-04-01', regionTags: ['West Africa', 'Sahel'] },
  { id: 'art-7', type: 'article', label: 'EU AI Act enforcement begins — first compliance audits launched',summary: 'TechCrunch — Les premiers audits de conformité à l\'AI Act débutent.', createdAt: '2026-04-03', regionTags: ['Europe'], sectorTags: ['Tech', 'Régulation'] },
  { id: 'art-8', type: 'article', label: 'Nigeria central bank raises rates to 30% amid inflation surge', summary: 'Reuters — La CBN relève son taux directeur à 30%, un record historique.', createdAt: '2026-03-25', regionTags: ['West Africa'], sectorTags: ['Finance'] },
  { id: 'art-9', type: 'article', label: 'OpenAI faces scrutiny under new EU AI regulations',             summary: 'Wired — OpenAI sous pression réglementaire européenne.', createdAt: '2026-04-04', regionTags: ['Europe', 'USA'], sectorTags: ['Tech'] },
  { id: 'art-10',type: 'article', label: 'Wagner group expands operations in Sahel mining regions',       summary: 'Africa Confidential — Africa Corps intensifie ses opérations dans les zones minières du Sahel.', createdAt: '2026-03-15', regionTags: ['Sahel'], sectorTags: ['Mines', 'Défense'] },
  { id: 'sig-1', type: 'signal',  label: 'Hausse du fret maritime +15% route Golfe persique',             summary: 'Signal quantitatif : les tarifs de fret sur la route du Golfe ont bondi de 15% en une semaine.', createdAt: '2026-04-09', regionTags: ['Middle East'], sectorTags: ['Énergie'] },
  { id: 'sig-2', type: 'signal',  label: 'Satellite : navires de guerre iraniens en formation',           summary: 'Données satellite montrant un regroupement inhabituels de navires iraniens près d\'Ormuz.', createdAt: '2026-04-07', regionTags: ['Middle East'], sectorTags: ['Défense'] },
  { id: 'sig-3', type: 'signal',  label: 'Polymarket : probabilité conflit Ormuz à 42%',                 summary: 'Les marchés prédictifs évaluent à 42% la probabilité d\'un incident majeur.', createdAt: '2026-04-10', regionTags: ['Middle East'] },
  { id: 'sig-4', type: 'signal',  label: 'Cours cacao spot : +8% en une semaine',                        summary: 'Le cours spot du cacao a gagné 8% en 5 séances.', createdAt: '2026-04-06', regionTags: ['West Africa'], sectorTags: ['Commodités'] },
  { id: 'sig-5', type: 'signal',  label: 'Naira : dépréciation de 12% en mars 2026',                     summary: 'Le naira nigérian a perdu 12% face au dollar en mars.', createdAt: '2026-04-01', regionTags: ['West Africa'], sectorTags: ['Finance'] },
  { id: 'sig-6', type: 'signal',  label: 'US-China: nouveau round de tarifs annoncé',                    summary: 'Les USA annoncent un nouveau paquet de tarifs sur les semi-conducteurs chinois.', createdAt: '2026-04-08', regionTags: ['USA', 'Asia'], sectorTags: ['Tech'] },
  { id: 'mkt-1', type: 'market_signal', label: 'Polymarket: Iran conflict 42%',                          probability: 0.42, createdAt: '2026-04-10', regionTags: ['Middle East'] },
  { id: 'mkt-2', type: 'market_signal', label: 'Kalshi: Cocoa > $10k by Sep 55%',                        probability: 0.55, createdAt: '2026-04-09', regionTags: ['West Africa'] },
  { id: 'art-11',type: 'article', label: 'China retaliates with export controls on rare earths',          summary: 'South China Morning Post — La Chine répond avec des contrôles à l\'export de terres rares.', createdAt: '2026-04-10', regionTags: ['Asia'], sectorTags: ['Tech', 'Mines'] },
  { id: 'art-12',type: 'article', label: 'Uranium prices spike as Sahel instability grows',              summary: 'Mining Weekly — Les prix de l\'uranium augmentent face à l\'instabilité au Sahel.', createdAt: '2026-03-22', regionTags: ['Sahel'], sectorTags: ['Mines', 'Énergie'] },
  { id: 'art-13',type: 'article', label: 'BCEAO maintient les taux malgré la pression inflationniste',   summary: 'Jeune Afrique — La banque centrale ouest-africaine maintient ses taux directeurs.', createdAt: '2026-04-05', regionTags: ['West Africa'], sectorTags: ['Finance'] },

  // ── Regions & Sectors ─────────────────────────────────────────────────────
  { id: 'reg-me',       type: 'region', label: 'Moyen-Orient',           importance: 8 },
  { id: 'reg-wa',       type: 'region', label: 'Afrique de l\'Ouest',     importance: 7 },
  { id: 'reg-sahel',    type: 'region', label: 'Sahel',                   importance: 7 },
  { id: 'reg-europe',   type: 'region', label: 'Europe',                  importance: 6 },
  { id: 'reg-usa',      type: 'region', label: 'États-Unis',              importance: 7 },
  { id: 'reg-asia',     type: 'region', label: 'Asie',                    importance: 6 },
  { id: 'sec-energy',   type: 'sector', label: 'Énergie',                 importance: 8 },
  { id: 'sec-defense',  type: 'sector', label: 'Défense & Sécurité',     importance: 7 },
  { id: 'sec-agri',     type: 'sector', label: 'Agriculture & Commodités', importance: 7 },
  { id: 'sec-tech',     type: 'sector', label: 'Tech & IA',               importance: 6 },
  { id: 'sec-finance',  type: 'sector', label: 'Finance & Macro',         importance: 7 },
  { id: 'sec-mines',    type: 'sector', label: 'Mines & Ressources',      importance: 6 },
]

export const MOCK_EDGES: IntelligenceGraphEdge[] = [
  // ── Hormuz cluster ────────────────────────────────────────────────────────
  { id: 'e1',  source: 'art-1',   target: 'ev-hormuz',   type: 'updates',    confidence: 0.9, explanation: 'L\'incident maritime confirme l\'escalade au détroit' },
  { id: 'e2',  source: 'art-2',   target: 'ev-hormuz',   type: 'updates',    confidence: 0.85, explanation: 'Les exercices navals iraniens augmentent les tensions' },
  { id: 'e3',  source: 'sig-1',   target: 'ev-hormuz',   type: 'supports',   confidence: 0.8, explanation: 'La hausse du fret confirme le risque de disruption' },
  { id: 'e4',  source: 'sig-2',   target: 'ev-hormuz',   type: 'supports',   confidence: 0.9, explanation: 'Données satellite corroborant les mouvements militaires' },
  { id: 'e5',  source: 'ev-hormuz',target: 'q-hormuz-90', type: 'raises_probability_of', confidence: 0.85, explanation: 'L\'escalade augmente la probabilité d\'incident' },
  { id: 'e6',  source: 'ent-iran', target: 'ev-hormuz',   type: 'impacts',    confidence: 0.95 },
  { id: 'e7',  source: 'ent-usa',  target: 'ev-hormuz',   type: 'impacts',    confidence: 0.9 },
  { id: 'e8',  source: 'ent-israel',target: 'ev-hormuz',  type: 'affects',    confidence: 0.7 },
  { id: 'e9',  source: 'mkt-1',   target: 'q-hormuz-90', type: 'linked_to',  confidence: 0.95, explanation: 'Marché prédictif directement lié à cette question' },
  { id: 'e10', source: 'sig-3',   target: 'q-hormuz-90', type: 'updates',    confidence: 0.9 },
  { id: 'e11', source: 'ev-hormuz',target: 'q-iran-deal', type: 'lowers_probability_of', confidence: 0.7, explanation: 'L\'escalade rend un cessez-le-feu moins probable' },
  { id: 'e12', source: 'ev-hormuz',target: 'reg-me',      type: 'belongs_to_region', confidence: 1 },
  { id: 'e13', source: 'ev-hormuz',target: 'sec-energy',  type: 'belongs_to_sector', confidence: 1 },
  { id: 'e14', source: 'ent-opec', target: 'ev-hormuz',   type: 'affects',    confidence: 0.6 },

  // ── Cocoa cluster ─────────────────────────────────────────────────────────
  { id: 'e20', source: 'art-3',   target: 'ev-cocoa',    type: 'updates',    confidence: 0.9 },
  { id: 'e21', source: 'art-4',   target: 'ev-cocoa',    type: 'supports',   confidence: 0.85, explanation: 'Révision de production confirme la crise d\'offre' },
  { id: 'e22', source: 'sig-4',   target: 'ev-cocoa',    type: 'supports',   confidence: 0.8 },
  { id: 'e23', source: 'ev-cocoa', target: 'q-cocoa-150', type: 'raises_probability_of', confidence: 0.8 },
  { id: 'e24', source: 'ent-civ',  target: 'ev-cocoa',    type: 'impacts',    confidence: 0.95 },
  { id: 'e25', source: 'ent-ghana',target: 'ev-cocoa',    type: 'impacts',    confidence: 0.9 },
  { id: 'e26', source: 'mkt-2',   target: 'q-cocoa-150', type: 'linked_to',  confidence: 0.9 },
  { id: 'e27', source: 'ev-cocoa', target: 'reg-wa',      type: 'belongs_to_region', confidence: 1 },
  { id: 'e28', source: 'ev-cocoa', target: 'sec-agri',    type: 'belongs_to_sector', confidence: 1 },
  { id: 'e29', source: 'ev-cocoa', target: 'ev-inflation', type: 'affects',   confidence: 0.6, explanation: 'La hausse des prix du cacao alimente l\'inflation régionale' },

  // ── Niger / Sahel cluster ─────────────────────────────────────────────────
  { id: 'e30', source: 'art-5',   target: 'ev-niger',    type: 'updates',    confidence: 0.85 },
  { id: 'e31', source: 'art-6',   target: 'ev-niger',    type: 'updates',    confidence: 0.8 },
  { id: 'e32', source: 'art-10',  target: 'ev-niger',    type: 'related_to', confidence: 0.7 },
  { id: 'e33', source: 'art-12',  target: 'ev-niger',    type: 'supports',   confidence: 0.65 },
  { id: 'e34', source: 'ev-niger', target: 'q-niger-exit', type: 'raises_probability_of', confidence: 0.75 },
  { id: 'e35', source: 'ev-niger', target: 'q-sahel-mine', type: 'raises_probability_of', confidence: 0.6 },
  { id: 'e36', source: 'ent-cedeao',    target: 'ev-niger',   type: 'impacts',  confidence: 0.9 },
  { id: 'e37', source: 'ent-niger-gov', target: 'ev-niger',   type: 'impacts',  confidence: 0.95 },
  { id: 'e38', source: 'ent-wagner',    target: 'ev-niger',   type: 'affects',  confidence: 0.7 },
  { id: 'e39', source: 'ent-russia',    target: 'ev-niger',   type: 'affects',  confidence: 0.6 },
  { id: 'e40', source: 'ev-niger', target: 'reg-sahel',  type: 'belongs_to_region', confidence: 1 },
  { id: 'e41', source: 'ev-niger', target: 'sec-defense', type: 'belongs_to_sector', confidence: 1 },
  { id: 'e42', source: 'art-5',   target: 'ent-iran',    type: 'mentions',   confidence: 0.8, explanation: 'L\'article mentionne les liens Iran-Niger' },

  // ── AI regulation cluster ─────────────────────────────────────────────────
  { id: 'e50', source: 'art-7',   target: 'ev-ai-reg',   type: 'updates',    confidence: 0.9 },
  { id: 'e51', source: 'art-9',   target: 'ev-ai-reg',   type: 'supports',   confidence: 0.8 },
  { id: 'e52', source: 'ev-ai-reg',target: 'q-ai-fine',   type: 'raises_probability_of', confidence: 0.7 },
  { id: 'e53', source: 'ent-eu',   target: 'ev-ai-reg',   type: 'impacts',    confidence: 0.95 },
  { id: 'e54', source: 'ent-openai',target: 'ev-ai-reg',  type: 'affects',    confidence: 0.8 },
  { id: 'e55', source: 'ev-ai-reg',target: 'reg-europe',  type: 'belongs_to_region', confidence: 1 },
  { id: 'e56', source: 'ev-ai-reg',target: 'sec-tech',    type: 'belongs_to_sector', confidence: 1 },

  // ── Inflation cluster ─────────────────────────────────────────────────────
  { id: 'e60', source: 'art-8',   target: 'ev-inflation', type: 'updates',    confidence: 0.9 },
  { id: 'e61', source: 'art-13',  target: 'ev-inflation', type: 'related_to', confidence: 0.7 },
  { id: 'e62', source: 'sig-5',   target: 'ev-inflation', type: 'supports',   confidence: 0.85 },
  { id: 'e63', source: 'ev-inflation',target: 'q-naira',   type: 'raises_probability_of', confidence: 0.8 },
  { id: 'e64', source: 'ent-cbn',  target: 'ev-inflation', type: 'impacts',    confidence: 0.9 },
  { id: 'e65', source: 'ent-bceao',target: 'ev-inflation', type: 'affects',    confidence: 0.6 },
  { id: 'e66', source: 'ev-inflation',target: 'reg-wa',    type: 'belongs_to_region', confidence: 1 },
  { id: 'e67', source: 'ev-inflation',target: 'sec-finance',type: 'belongs_to_sector', confidence: 1 },

  // ── US-China cluster ──────────────────────────────────────────────────────
  { id: 'e70', source: 'sig-6',   target: 'q-china-tariff', type: 'raises_probability_of', confidence: 0.8 },
  { id: 'e71', source: 'art-11',  target: 'q-china-tariff', type: 'supports',  confidence: 0.75 },
  { id: 'e72', source: 'ent-usa',  target: 'q-china-tariff', type: 'impacts',  confidence: 0.9 },
  { id: 'e73', source: 'ent-china',target: 'q-china-tariff', type: 'impacts',  confidence: 0.9 },
  { id: 'e74', source: 'q-china-tariff',target: 'reg-asia',  type: 'belongs_to_region', confidence: 1 },
  { id: 'e75', source: 'q-china-tariff',target: 'sec-tech',  type: 'belongs_to_sector', confidence: 1 },

  // ── Cross-cluster connections ─────────────────────────────────────────────
  { id: 'e80', source: 'ev-hormuz',  target: 'ev-inflation', type: 'affects', confidence: 0.5, explanation: 'Les disruptions du trafic maritime impactent les coûts d\'importation' },
  { id: 'e81', source: 'ev-niger',   target: 'ev-hormuz',    type: 'related_to', confidence: 0.4, explanation: 'Rapprochement Iran-Niger — axe géopolitique commun' },
  { id: 'e82', source: 'ent-iran',   target: 'ent-niger-gov',type: 'linked_to', confidence: 0.6, explanation: 'Partenariat stratégique émergent' },
  { id: 'e83', source: 'ev-hormuz',  target: 'sec-defense',  type: 'belongs_to_sector', confidence: 1 },
  { id: 'e84', source: 'ev-niger',   target: 'sec-mines',    type: 'belongs_to_sector', confidence: 0.8 },
]
