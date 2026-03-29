/**
 * Seed data pour le pipeline opportunités — scénarios réalistes.
 *
 * Usage : npx tsx lib/opportunities/seed-pipeline.ts
 *
 * Crée des discovered_sources, fetched_pages, extracted_signals,
 * opportunity_evidence avec des données crédibles.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const SCENARIOS = [
  {
    name: 'Recrutement massif — SIFCA',
    company: { name: 'SIFCA', sector: 'Agro-industrie', country: 'CI' },
    signals: [
      { type: 'hiring_spike', subtype: 'operations', label: 'Recrutement massif postes terrain', summary: 'SIFCA a publié 11 offres d\'emploi en 21 jours, principalement des postes opérationnels : 4 chefs d\'exploitation, 3 responsables logistique, 2 superviseurs plantation, 2 postes qualité.', confidence: 0.85, event_date: '2026-03-12', facts: { job_count: 11, departments: ['operations', 'logistics', 'quality'], timeframe: '21 days' }, source: 'emploi.ci', url: 'https://www.emploi.ci/offres/sifca' },
      { type: 'hiring_spike', subtype: 'management', label: 'Recrutement direction supply chain', summary: 'Poste de Directeur Supply Chain ouvert chez SIFCA avec profil senior (15+ ans), indiquant une restructuration logistique majeure.', confidence: 0.78, event_date: '2026-03-08', facts: { position: 'Directeur Supply Chain', seniority: '15+ years' }, source: 'LinkedIn', url: 'https://linkedin.com/jobs/sifca-supply-chain' },
      { type: 'expansion_plan', subtype: null, label: 'Extension usine de transformation', summary: 'SIFCA prévoit l\'extension de son usine de transformation à San Pedro, avec un investissement de 12 milliards FCFA.', confidence: 0.72, event_date: '2026-02-28', facts: { investment: '12B FCFA', location: 'San Pedro' }, source: 'Jeune Afrique', url: 'https://jeuneafrique.com/sifca-san-pedro' },
    ],
  },
  {
    name: 'Appel d\'offres — Port Autonome d\'Abidjan',
    company: { name: 'Port Autonome d\'Abidjan', sector: 'Infrastructure', country: 'CI' },
    signals: [
      { type: 'tender_detected', subtype: 'infrastructure', label: 'Appel d\'offres extension terminal conteneurs', summary: 'Le PAA lance un appel d\'offres international pour l\'extension du terminal conteneurs TC2, budget estimé 180 milliards FCFA, date limite de soumission 15 avril 2026.', confidence: 0.95, event_date: '2026-03-15', facts: { budget: '180B FCFA', deadline: '2026-04-15', type: 'international' }, source: 'marchespublics.ci', url: 'https://marchespublics.ci/paa-tc2-2026' },
      { type: 'procurement_signal', subtype: 'equipment', label: 'Consultation portiques de manutention', summary: 'Consultation restreinte pour l\'acquisition de 4 portiques RTG pour le port d\'Abidjan.', confidence: 0.88, event_date: '2026-03-10', facts: { equipment: '4 RTG cranes', type: 'restricted' }, source: 'PAA Newsletter', url: 'https://portabidjan.ci/actualites' },
    ],
  },
  {
    name: 'Expansion — Ecobank',
    company: { name: 'Ecobank', sector: 'Banque', country: 'TG' },
    signals: [
      { type: 'new_location', subtype: 'branch', label: 'Ouverture 15 nouvelles agences', summary: 'Ecobank annonce l\'ouverture de 15 nouvelles agences en Afrique de l\'Ouest d\'ici fin 2026, dont 5 en Côte d\'Ivoire et 4 au Sénégal.', confidence: 0.80, event_date: '2026-03-01', facts: { count: 15, countries: ['CI', 'SN', 'GH', 'BF'], timeline: '2026' }, source: 'Ecofin', url: 'https://agenceecofin.com/ecobank-agences-2026' },
      { type: 'executive_change', subtype: null, label: 'Nouveau DG régional Afrique de l\'Ouest', summary: 'Nomination d\'Amina Diallo au poste de DG régional Afrique de l\'Ouest d\'Ecobank, en remplacement de K. Mensah.', confidence: 0.90, event_date: '2026-02-20', facts: { new_exec: 'Amina Diallo', role: 'DG Régional AO', previous: 'K. Mensah' }, source: 'Financial Afrik', url: 'https://financialafrik.com/ecobank-dg' },
      { type: 'funding_event', subtype: null, label: 'Ligne de crédit IFC 200M USD', summary: 'Ecobank sécurise une ligne de crédit de 200 millions USD auprès de l\'IFC pour financer les PME en Afrique de l\'Ouest.', confidence: 0.85, event_date: '2026-03-05', facts: { amount: '200M USD', source_org: 'IFC', target: 'PME Afrique de l\'Ouest' }, source: 'Reuters', url: 'https://reuters.com/ecobank-ifc-2026' },
    ],
  },
  {
    name: 'Nouveau site — Nestlé CI',
    company: { name: 'Nestlé Côte d\'Ivoire', sector: 'Agroalimentaire', country: 'CI' },
    signals: [
      { type: 'new_location', subtype: 'factory', label: 'Construction nouvelle usine à Yamoussoukro', summary: 'Nestlé CI lance la construction d\'une nouvelle usine de production à Yamoussoukro, investissement de 45 milliards FCFA, 500 emplois prévus.', confidence: 0.88, event_date: '2026-03-18', facts: { location: 'Yamoussoukro', investment: '45B FCFA', jobs: 500 }, source: 'Fratmat', url: 'https://fratmat.info/nestle-yamoussoukro' },
      { type: 'hiring_spike', subtype: null, label: 'Recrutement industriel massif', summary: 'Nestlé CI publie 23 postes liés à la nouvelle usine : ingénieurs process, techniciens maintenance, opérateurs de ligne.', confidence: 0.75, event_date: '2026-03-20', facts: { job_count: 23, type: 'industrial' }, source: 'emploi.ci', url: 'https://emploi.ci/nestle-ci' },
    ],
  },
  {
    name: 'Partenariat — Orange CI',
    company: { name: 'Orange Côte d\'Ivoire', sector: 'Télécoms', country: 'CI' },
    signals: [
      { type: 'partnership', subtype: 'strategic', label: 'Partenariat stratégique avec AWS', summary: 'Orange CI signe un partenariat stratégique avec Amazon Web Services pour déployer des services cloud en Afrique de l\'Ouest.', confidence: 0.82, event_date: '2026-03-10', facts: { partner: 'AWS', scope: 'Cloud services West Africa' }, source: 'CIO Mag', url: 'https://cio-mag.com/orange-aws' },
      { type: 'project_launch', subtype: 'tech', label: 'Lancement plateforme IoT industrielle', summary: 'Orange Business lance une plateforme IoT dédiée au secteur industriel et agricole en Côte d\'Ivoire.', confidence: 0.70, event_date: '2026-03-14', facts: { product: 'IoT Platform', sectors: ['industry', 'agriculture'] }, source: 'TechCabal', url: 'https://techcabal.com/orange-iot' },
    ],
  },
  {
    name: 'Faible preuve — Société Générale CI',
    company: { name: 'Société Générale CI', sector: 'Banque', country: 'CI' },
    signals: [
      { type: 'digital_activity_spike', subtype: null, label: 'Activité web en hausse', summary: 'Augmentation de 30% du trafic web de SGCI détectée.', confidence: 0.25, event_date: '2026-03-22', facts: { increase: '30%' }, source: 'SimilarWeb', url: '' },
    ],
  },
]

async function seedPipeline() {
  const admin = createAdminClient()
  console.log('[seed-pipeline] Démarrage...\n')

  // Get a test account
  const { data: accounts } = await admin.from('accounts').select('id').limit(1)
  if (!accounts?.length) { console.log('Aucun account trouvé'); return }
  const accountId = accounts[0].id

  // Get a watch
  const { data: watches } = await admin.from('watches').select('id').eq('account_id', accountId).limit(1)
  if (!watches?.length) { console.log('Aucune veille trouvée'); return }
  const watchId = watches[0].id

  for (const scenario of SCENARIOS) {
    console.log(`\n── ${scenario.name} ──`)

    // Find or create company
    let { data: co } = await admin.from('companies')
      .select('id').ilike('name', `%${scenario.company.name}%`).limit(1)

    let companyId: string
    if (co?.length) {
      companyId = co[0].id
    } else {
      const { data: inserted } = await admin.from('companies').insert({
        name: scenario.company.name,
        sector: scenario.company.sector,
        country: scenario.company.country,
      }).select('id').single()
      companyId = inserted!.id
    }

    // Create discovered source
    const { data: source } = await admin.from('discovered_sources').insert({
      account_id: accountId,
      watch_id: watchId,
      query: `${scenario.company.name} actualités ${new Date().getFullYear()}`,
      title: `Résultats pour ${scenario.company.name}`,
      url: scenario.signals[0].url,
      domain: (() => { try { return new URL(scenario.signals[0].url).hostname } catch { return 'web' } })(),
      snippet: scenario.signals[0].summary.slice(0, 200),
      relevance_score: 0.8,
      status: 'fetched',
      provider: 'seed',
    }).select('id').single()

    const sourceId = source?.id

    // Create fetched page
    const { data: page } = await admin.from('fetched_pages').insert({
      account_id: accountId,
      source_id: sourceId,
      url: scenario.signals[0].url,
      domain: (() => { try { return new URL(scenario.signals[0].url).hostname } catch { return 'web' } })(),
      title: scenario.signals[0].label,
      extracted_text: scenario.signals.map(s => s.summary).join('\n\n'),
      fetch_status: 'success',
      word_count: 200,
    }).select('id').single()

    const pageId = page?.id

    // Create extracted signals
    for (const sig of scenario.signals) {
      await admin.from('extracted_signals').insert({
        account_id: accountId,
        watch_id: watchId,
        page_id: pageId,
        company_id: companyId,
        company_name_raw: scenario.company.name,
        company_country_raw: scenario.company.country,
        signal_type: sig.type,
        signal_subtype: sig.subtype,
        signal_label: sig.label,
        signal_summary: sig.summary,
        extracted_facts: sig.facts,
        confidence_score: sig.confidence,
        source_reliability: 0.7,
        source_url: sig.url,
        source_name: sig.source,
        event_date: sig.event_date,
      })
    }

    console.log(`  ${scenario.signals.length} signaux seed créés pour ${scenario.company.name}`)
  }

  console.log('\n[seed-pipeline] Seed terminé. Lancez la qualification pour générer les opportunités.')
}

seedPipeline().catch(console.error)
