/**
 * Seed réaliste pour le module Opportunités.
 *
 * Génère des signaux crédibles (recrutement, AO, expansion, etc.)
 * puis lance le recompute pour produire des opportunités avec
 * trigger principal, hypothèse business et preuves.
 *
 * Usage : npx tsx lib/opportunities/seed-opportunities.ts
 */

import { createAdminClient } from '../supabase/admin'
import { recomputeOpportunities } from './opportunity-engine'

interface SeedCompany {
  name: string; sector: string; country: string
  website: string | null; employee_range: string; company_type: string
}

interface SeedSignal {
  companyIndex: number; type: string; title: string
  rawContent: string; daysAgo: number; confidence: number
  sourceName: string | null; url: string | null
}

const COMPANIES: SeedCompany[] = [
  { name: 'Wave Mobile Money', sector: 'Fintech', country: 'CI', website: 'https://www.wave.com', employee_range: '1000-5000', company_type: 'Fintech' },
  { name: 'Endeavour Mining', sector: 'Mines', country: 'CI', website: 'https://www.endeavourmining.com', employee_range: '5000+', company_type: 'Exploitant minier' },
  { name: 'Cimaf Côte d\'Ivoire', sector: 'BTP', country: 'CI', website: 'https://www.cimaf.ma', employee_range: '500-1000', company_type: 'Cimentier' },
  { name: 'Orange CI', sector: 'Télécom', country: 'CI', website: 'https://www.orange.ci', employee_range: '1000-5000', company_type: 'Opérateur télécom' },
  { name: 'Bolloré Transport & Logistics', sector: 'Distribution', country: 'CI', website: 'https://www.bollore-transport-logistics.com', employee_range: '5000+', company_type: 'Logistique' },
  { name: 'SIFCA Group', sector: 'Agriculture', country: 'CI', website: 'https://www.groupesifca.com', employee_range: '5000+', company_type: 'Agro-industriel' },
  { name: 'Vivo Energy CI', sector: 'Énergie', country: 'CI', website: 'https://www.vivoenergy.com', employee_range: '500-1000', company_type: 'Distribution carburant' },
  { name: 'Ecobank CI', sector: 'Banque', country: 'CI', website: 'https://www.ecobank.com', employee_range: '1000-5000', company_type: 'Banque' },
]

const SIGNALS: SeedSignal[] = [
  // Wave — recrutement massif (4 signaux hiring + 1 expansion)
  { companyIndex: 0, type: 'hiring_spike', title: 'Recrutement de 4 Sales Managers', rawContent: 'Wave recrute 4 responsables commerciaux pour les régions Abidjan, Bouaké, San Pedro et Daloa.', daysAgo: 3, confidence: 0.85, sourceName: 'LinkedIn Jobs', url: null },
  { companyIndex: 0, type: 'hiring_spike', title: '2 postes Operations Officer publiés', rawContent: 'Offres d\'emploi pour 2 Operations Officers chez Wave Mobile Money.', daysAgo: 5, confidence: 0.75, sourceName: 'Emploi.ci', url: null },
  { companyIndex: 0, type: 'hiring_spike', title: 'Recrutement support technique x3', rawContent: 'Wave publie 3 offres de support technique senior sur LinkedIn.', daysAgo: 12, confidence: 0.70, sourceName: 'LinkedIn Jobs', url: null },
  { companyIndex: 0, type: 'expansion_plan', title: 'Wave annonce son expansion vers les villes secondaires', rawContent: 'Article annonçant le déploiement de Wave dans 15 nouvelles villes ivoiriennes.', daysAgo: 8, confidence: 0.65, sourceName: 'Jeune Afrique', url: 'https://www.jeuneafrique.com/wave-expansion' },
  { companyIndex: 0, type: 'hiring_spike', title: 'Recrutement business developer x2', rawContent: 'Deux postes de business developer senior ouverts chez Wave.', daysAgo: 18, confidence: 0.60, sourceName: 'LinkedIn Jobs', url: null },

  // Endeavour — appel d'offres + procurement
  { companyIndex: 1, type: 'tender_detected', title: 'AO pour fourniture d\'équipements de forage', rawContent: 'Endeavour Mining lance un appel d\'offres pour la fourniture de foreuses et équipements de prospection pour le site d\'Ity.', daysAgo: 5, confidence: 0.90, sourceName: 'DGMP', url: 'https://marchespublics.ci/ao-12345' },
  { companyIndex: 1, type: 'procurement_signal', title: 'Consultation fournisseurs équipements logistiques', rawContent: 'Endeavour recherche des fournisseurs pour le transport et la logistique minière.', daysAgo: 10, confidence: 0.75, sourceName: 'Mine Journal', url: null },
  { companyIndex: 1, type: 'project_launch', title: 'Phase 2 du projet minier d\'Ity lancée', rawContent: 'Endeavour Mining démarre la phase 2 d\'expansion de la mine d\'or d\'Ity avec un investissement de 80M USD.', daysAgo: 15, confidence: 0.80, sourceName: 'Mining Weekly', url: 'https://miningweekly.com/ity-phase2' },

  // Cimaf — nouveau site
  { companyIndex: 2, type: 'new_location', title: 'Ouverture d\'un dépôt de ciment à San Pedro', rawContent: 'Cimaf CI prévoit l\'ouverture d\'un dépôt de stockage et distribution à San Pedro.', daysAgo: 7, confidence: 0.70, sourceName: 'Fratmat', url: null },
  { companyIndex: 2, type: 'import_activity', title: 'Importation de 50 000 tonnes de clinker', rawContent: 'Manifeste d\'importation : 50 000 tonnes de clinker via le port d\'Abidjan pour Cimaf.', daysAgo: 12, confidence: 0.65, sourceName: 'Douanes CI', url: null },

  // Orange — levée de fonds / partenariat
  { companyIndex: 3, type: 'funding_event', title: 'Orange CI reçoit un financement IFC de 40M EUR', rawContent: 'La SFI accorde un prêt de 40 millions d\'euros à Orange CI pour le déploiement 4G.', daysAgo: 10, confidence: 0.85, sourceName: 'Reuters', url: 'https://reuters.com/orange-ci-ifc' },
  { companyIndex: 3, type: 'partnership', title: 'Partenariat Orange CI - Huawei pour la 5G', rawContent: 'Orange CI signe un MoU avec Huawei pour préparer le déploiement de la 5G.', daysAgo: 20, confidence: 0.70, sourceName: 'CIO Mag', url: null },

  // Bolloré — executive change
  { companyIndex: 4, type: 'executive_change', title: 'Nouveau DG chez Bolloré Transport CI', rawContent: 'Nomination d\'un nouveau Directeur Général pour les opérations Bolloré en Côte d\'Ivoire.', daysAgo: 8, confidence: 0.80, sourceName: 'Abidjan.net', url: null },
  { companyIndex: 4, type: 'hiring_spike', title: 'Recrutement de 5 responsables logistiques', rawContent: 'Bolloré recrute des profils senior en logistique portuaire.', daysAgo: 14, confidence: 0.60, sourceName: 'LinkedIn Jobs', url: null },

  // SIFCA — expansion agro
  { companyIndex: 5, type: 'expansion_plan', title: 'SIFCA annonce l\'extension de ses plantations d\'hévéa', rawContent: 'Le groupe SIFCA prévoit d\'étendre ses plantations d\'hévéa de 5000 hectares d\'ici 2027.', daysAgo: 6, confidence: 0.75, sourceName: 'Commodafrica', url: null },
  { companyIndex: 5, type: 'project_launch', title: 'Nouvelle usine de transformation de palmier à huile', rawContent: 'SIFCA lance la construction d\'une usine de transformation à Soubré.', daysAgo: 15, confidence: 0.70, sourceName: 'Jeune Afrique', url: null },

  // Vivo — procurement
  { companyIndex: 6, type: 'procurement_signal', title: 'Consultation pour modernisation stations-service', rawContent: 'Vivo Energy CI consulte des entreprises BTP pour la rénovation de 20 stations Shell.', daysAgo: 4, confidence: 0.80, sourceName: 'BTP Direct', url: null },

  // Ecobank — digital
  { companyIndex: 7, type: 'digital_activity_spike', title: 'Pic d\'activité web Ecobank CI', rawContent: 'Hausse de 300% du trafic web Ecobank CI sur les pages produits entreprises.', daysAgo: 45, confidence: 0.30, sourceName: null, url: null },
]

async function seed() {
  console.log('🌱 Seed opportunités (données réalistes)...')
  const admin = createAdminClient()

  const { data: accounts } = await admin.from('accounts').select('id').limit(1)
  if (!accounts?.length) { console.log('⚠️ Aucun account. Abandon.'); return }
  const accountId = accounts[0].id

  let { data: watches } = await admin.from('watches').select('id').eq('account_id', accountId).limit(1)
  let watchId: string
  if (watches?.length) {
    watchId = watches[0].id
  } else {
    const { data: w } = await admin.from('watches').insert({
      account_id: accountId,
      name: 'Veille BTP, Mines, Fintech — Afrique de l\'Ouest',
      sectors: ['BTP', 'Mines', 'Agriculture', 'Fintech', 'Télécom'],
      countries: ['CI', 'SN', 'GN', 'ML'],
      frequency: 'daily', is_active: true,
    }).select('id').single()
    watchId = w!.id
  }
  console.log(`  Watch: ${watchId}`)

  const companyIds: string[] = []
  for (const co of COMPANIES) {
    const { data: existing } = await admin.from('companies').select('id').eq('name', co.name).limit(1)
    if (existing?.length) {
      companyIds.push(existing[0].id)
      await admin.from('companies').update({
        sector: co.sector, country: co.country, website: co.website,
        employee_range: co.employee_range, company_type: co.company_type,
      }).eq('id', existing[0].id)
    } else {
      const { data: n } = await admin.from('companies').insert({
        name: co.name, sector: co.sector, country: co.country,
        website: co.website, employee_range: co.employee_range,
        company_type: co.company_type, is_global: true,
      }).select('id').single()
      companyIds.push(n!.id)
    }
  }

  for (const cid of companyIds) {
    await admin.from('watch_companies').upsert(
      { watch_id: watchId, company_id: cid },
      { onConflict: 'watch_id,company_id' },
    )
  }

  let signalCount = 0
  for (const s of SIGNALS) {
    const cid = companyIds[s.companyIndex]
    const detectedAt = new Date(Date.now() - s.daysAgo * 86_400_000).toISOString()
    await admin.from('signals').insert({
      watch_id: watchId, company_id: cid,
      signal_type: s.type, title: s.title,
      raw_content: s.rawContent,
      collected_at: detectedAt,
      relevance_score: s.confidence,
      confidence_score: s.confidence,
      is_processed: true,
      source_name: s.sourceName,
      url: s.url,
    })
    signalCount++
  }
  console.log(`  ${signalCount} signaux créés`)

  console.log('  🔄 Calcul des opportunités...')
  const result = await recomputeOpportunities(admin, accountId)
  console.log(`  ✓ ${result.created} créées, ${result.updated} mises à jour`)
  if (result.errors.length) console.log(`  ⚠️ ${result.errors.join('; ')}`)
  console.log('✅ Seed terminé.')
}

seed().catch(console.error)
