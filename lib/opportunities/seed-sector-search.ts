/**
 * Seed data — Recherches sectorielles réalistes.
 *
 * Usage : npx tsx lib/opportunities/seed-sector-search.ts
 *
 * Scénarios :
 * 1. BTP Sénégal       — appels d'offres route, chantier logement, recrutement
 * 2. BTP Côte d'Ivoire — extension infrastructure, marché public
 * 3. Mines Côte d'Ivoire — exploration or, permis, équipements
 * 4. Agro Ghana        — transformation cacao, investissement, plantation
 */

import { createAdminClient } from '@/lib/supabase/admin'

const DEMO_ACCOUNT_ID = process.env.DEMO_ACCOUNT_ID || '00000000-0000-0000-0000-000000000001'
const DEMO_USER_ID = process.env.DEMO_USER_ID || '00000000-0000-0000-0000-000000000002'

interface SeedScenario {
  search: {
    sector: string
    country: string
    subSector?: string
    keywords?: string[]
  }
  signals: {
    companyName: string
    signalType: string
    signalLabel: string
    signalSummary: string
    confidence: number
    sourceUrl: string
    sourceName: string
    eventDate?: string
  }[]
}

const SCENARIOS: SeedScenario[] = [
  {
    search: { sector: 'BTP', country: 'SN', subSector: 'Routes' },
    signals: [
      {
        companyName: 'AGEROUTE Sénégal',
        signalType: 'tender_detected',
        signalLabel: 'Appel d\'offres — Construction Route Nationale RN6',
        signalSummary: 'AGEROUTE lance un appel d\'offres pour la réhabilitation de 45 km de la RN6 entre Kaolack et Fatick. Budget estimé 12 milliards FCFA.',
        confidence: 0.88,
        sourceUrl: 'https://ageroute.sn/appels-offres/rn6-kaolack-fatick',
        sourceName: 'AGEROUTE',
        eventDate: '2026-03-15',
      },
      {
        companyName: 'AGEROUTE Sénégal',
        signalType: 'procurement_signal',
        signalLabel: 'Marché public fourniture bitume RN6',
        signalSummary: 'Consultation pour la fourniture de 5000 tonnes de bitume modifié pour le projet RN6.',
        confidence: 0.75,
        sourceUrl: 'https://marchespublics.sn/consultation/bitume-rn6',
        sourceName: 'Marchés Publics SN',
      },
      {
        companyName: 'CSE Sénégal',
        signalType: 'project_launch',
        signalLabel: 'Nouveau programme logements sociaux Diamniadio',
        signalSummary: 'CSE démarre la construction de 2000 logements sociaux à Diamniadio, phase 3 du programme national.',
        confidence: 0.82,
        sourceUrl: 'https://aps.sn/logements-diamniadio-phase3',
        sourceName: 'APS',
        eventDate: '2026-03-10',
      },
      {
        companyName: 'Eiffage Sénégal',
        signalType: 'hiring_spike',
        signalLabel: 'Recrutement massif — 200 postes chantier TER2',
        signalSummary: 'Eiffage Sénégal recrute 200 ouvriers et techniciens pour l\'extension du TER vers Blaise Diagne.',
        confidence: 0.72,
        sourceUrl: 'https://eiffage.sn/carrieres/ter2-extension',
        sourceName: 'Eiffage Sénégal',
        eventDate: '2026-02-28',
      },
      {
        companyName: 'Sogea-Satom',
        signalType: 'expansion_plan',
        signalLabel: 'Extension site industriel Sogea-Satom Dakar',
        signalSummary: 'Sogea-Satom agrandit sa base logistique à Dakar pour supporter les nouveaux projets routiers.',
        confidence: 0.65,
        sourceUrl: 'https://sogea-satom.com/news/dakar-expansion',
        sourceName: 'Sogea-Satom',
      },
    ],
  },
  {
    search: { sector: 'BTP', country: 'CI' },
    signals: [
      {
        companyName: 'Ministère de l\'Équipement CI',
        signalType: 'tender_detected',
        signalLabel: 'AOI — Pont Yopougon-Plateau',
        signalSummary: 'Appel d\'offres international pour la construction du 5ème pont Yopougon-Plateau à Abidjan. Budget : 180 milliards FCFA.',
        confidence: 0.9,
        sourceUrl: 'https://marches-publics.ci/pont-yopougon',
        sourceName: 'DMP CI',
        eventDate: '2026-03-20',
      },
      {
        companyName: 'BNETD',
        signalType: 'project_launch',
        signalLabel: 'Programme autoroute Abidjan-San Pedro',
        signalSummary: 'Lancement des études détaillées pour l\'autoroute Abidjan-San Pedro, 350 km.',
        confidence: 0.78,
        sourceUrl: 'https://bnetd.ci/projets/autoroute-san-pedro',
        sourceName: 'BNETD',
        eventDate: '2026-02-25',
      },
      {
        companyName: 'Bouygues CI',
        signalType: 'hiring_spike',
        signalLabel: 'Recrutement Bouygues — 150 postes chantier métro',
        signalSummary: 'Bouygues Travaux Publics recrute pour le projet de métro d\'Abidjan ligne 1.',
        confidence: 0.7,
        sourceUrl: 'https://bouygues-tp.com/abidjan-metro-jobs',
        sourceName: 'Bouygues TP',
      },
    ],
  },
  {
    search: { sector: 'Mines', country: 'CI', keywords: ['or', 'exploration'] },
    signals: [
      {
        companyName: 'Perseus Mining',
        signalType: 'expansion_plan',
        signalLabel: 'Extension mine d\'or Yaouré — Phase 2',
        signalSummary: 'Perseus Mining annonce l\'extension de Yaouré avec un investissement de 150M$ pour augmenter la production à 300 000 oz/an.',
        confidence: 0.85,
        sourceUrl: 'https://perseusmining.com/yaouré-phase2',
        sourceName: 'Perseus Mining',
        eventDate: '2026-03-01',
      },
      {
        companyName: 'SODEMI',
        signalType: 'project_launch',
        signalLabel: 'Nouveau permis exploration SODEMI — Zone Nord',
        signalSummary: 'La SODEMI obtient un nouveau permis d\'exploration dans le nord du pays, zone de Tengrela.',
        confidence: 0.73,
        sourceUrl: 'https://sodemi.ci/permis/tengrela-nord',
        sourceName: 'SODEMI',
        eventDate: '2026-02-15',
      },
      {
        companyName: 'Endeavour Mining',
        signalType: 'procurement_signal',
        signalLabel: 'Appel offres équipements mine Ity',
        signalSummary: 'Endeavour Mining lance un appel pour la fourniture d\'équipements de traitement à la mine d\'Ity.',
        confidence: 0.68,
        sourceUrl: 'https://endeavourmining.com/procurement/ity',
        sourceName: 'Endeavour Mining',
      },
    ],
  },
  {
    search: { sector: 'Agriculture', country: 'GH', subSector: 'Cacao' },
    signals: [
      {
        companyName: 'COCOBOD Ghana',
        signalType: 'funding_event',
        signalLabel: 'Investissement $500M — Programme productivité cacao',
        signalSummary: 'COCOBOD et la Banque Mondiale annoncent un programme de 500M$ pour moderniser la filière cacao ghanéenne.',
        confidence: 0.87,
        sourceUrl: 'https://cocobod.gh/programmes/productivity-2026',
        sourceName: 'COCOBOD',
        eventDate: '2026-03-05',
      },
      {
        companyName: 'Barry Callebaut Ghana',
        signalType: 'new_location',
        signalLabel: 'Nouvelle usine transformation cacao — Tema',
        signalSummary: 'Barry Callebaut construit une nouvelle unité de transformation à Tema, capacité 50 000 tonnes/an.',
        confidence: 0.8,
        sourceUrl: 'https://barry-callebaut.com/ghana-tema-plant',
        sourceName: 'Barry Callebaut',
        eventDate: '2026-02-20',
      },
      {
        companyName: 'Ghana Cocoa Board',
        signalType: 'tender_detected',
        signalLabel: 'AON — Fourniture engrais programme CHED',
        signalSummary: 'Appel national pour la fourniture de 200 000 tonnes d\'engrais pour le programme CHED 2026.',
        confidence: 0.74,
        sourceUrl: 'https://procurement.gov.gh/tenders/ched-fertilizer',
        sourceName: 'Public Procurement Ghana',
        eventDate: '2026-03-12',
      },
    ],
  },
]

async function seedSectorSearches() {
  const admin = createAdminClient()
  console.log('\n═══ SEED : Recherches sectorielles ═══\n')

  for (const scenario of SCENARIOS) {
    const { search, signals } = scenario
    console.log(`\n── ${search.sector} / ${search.country} ──`)

    // Create search
    const { data: searchRecord, error: searchErr } = await admin
      .from('opportunity_searches')
      .insert({
        account_id: DEMO_ACCOUNT_ID,
        created_by: DEMO_USER_ID,
        mode: 'sector_based',
        sector: search.sector,
        sub_sector: search.subSector || null,
        country: search.country,
        keywords: search.keywords || [],
        opportunity_types: [],
        date_range_days: 30,
        status: 'completed',
        results_count: signals.length,
        stats: { seeded: true },
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (searchErr) {
      console.error(`  ✗ Search: ${searchErr.message}`)
      continue
    }
    console.log(`  ✓ Search: ${searchRecord.id}`)

    // Create extracted signals
    for (const sig of signals) {
      const { data: sigRecord, error: sigErr } = await admin
        .from('extracted_signals')
        .insert({
          account_id: DEMO_ACCOUNT_ID,
          search_id: searchRecord.id,
          watch_id: null,
          company_name_raw: sig.companyName,
          signal_type: sig.signalType,
          signal_label: sig.signalLabel,
          signal_summary: sig.signalSummary,
          confidence_score: sig.confidence,
          source_reliability: 0.7,
          source_url: sig.sourceUrl,
          source_name: sig.sourceName,
          source_domain: new URL(sig.sourceUrl).hostname,
          detected_at: new Date().toISOString(),
          event_date: sig.eventDate || null,
          extracted_facts: {},
        })
        .select('id')
        .single()

      if (sigErr) {
        console.error(`  ✗ Signal "${sig.signalLabel.slice(0, 40)}": ${sigErr.message}`)
      } else {
        console.log(`  ✓ Signal: ${sig.signalType} — ${sig.companyName}`)
      }
    }
  }

  console.log('\n═══ Seed terminé ═══\n')
}

seedSectorSearches().catch(console.error)
