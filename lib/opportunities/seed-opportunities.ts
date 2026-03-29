/**
 * Script de seed pour les opportunités (données de démo).
 *
 * Usage : npx tsx lib/opportunities/seed-opportunities.ts
 *
 * Génère des opportunités fictives à partir des veilles et signaux existants,
 * ou insère des données mock si aucune donnée n'existe.
 */

import { createAdminClient } from '../supabase/admin'
import { recomputeOpportunities } from './opportunity-engine'

const MOCK_COMPANIES = [
  { name: 'SIFCA Group', sector: 'Agriculture', country: 'CI', website: 'https://www.sifca-group.com', employee_range: '5000+', company_type: 'Groupe agro-industriel' },
  { name: 'Endeavour Mining', sector: 'Mines', country: 'CI', website: 'https://www.endeavourmining.com', employee_range: '1000-5000', company_type: 'Exploitant minier' },
  { name: 'Cimaf CI', sector: 'BTP', country: 'CI', website: 'https://www.cimaf.ma', employee_range: '500-1000', company_type: 'Cimentier' },
  { name: 'Solibra', sector: 'Industrie', country: 'CI', website: 'https://www.solibra.ci', employee_range: '1000-5000', company_type: 'Brasseur' },
  { name: 'MTN Côte d\'Ivoire', sector: 'Télécom', country: 'CI', website: 'https://www.mtn.ci', employee_range: '1000-5000', company_type: 'Opérateur télécom' },
  { name: 'Bolloré Transport', sector: 'Distribution', country: 'CI', website: 'https://www.bollore-transport-logistics.com', employee_range: '5000+', company_type: 'Logistique' },
  { name: 'Ivoire Agro-Industries', sector: 'Agriculture', country: 'CI', website: null, employee_range: '100-500', company_type: 'Transformateur' },
  { name: 'SGS Minerals', sector: 'Mines', country: 'GN', website: 'https://www.sgs.com', employee_range: '5000+', company_type: 'Laboratoire' },
  { name: 'Vivo Energy CI', sector: 'Énergie', country: 'CI', website: 'https://www.vivoenergy.com', employee_range: '500-1000', company_type: 'Distributeur carburant' },
  { name: 'Ecobank CI', sector: 'Banque', country: 'CI', website: 'https://www.ecobank.com', employee_range: '1000-5000', company_type: 'Banque' },
]

const SIGNAL_TYPES = [
  'tender_detected', 'project_launch', 'expansion_plan', 'hiring_spike',
  'procurement_signal', 'funding_event', 'new_location', 'partnership',
]

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function randomDate(daysBack: number): string {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack))
  return d.toISOString()
}

async function seed() {
  console.log('🌱 Seed opportunités...')
  const admin = createAdminClient()

  // 1. Trouver un account_id existant
  const { data: accounts } = await admin.from('accounts').select('id').limit(1)
  if (!accounts?.length) {
    console.log('⚠️ Aucun account trouvé. Impossible de seed.')
    return
  }
  const accountId = accounts[0].id
  console.log(`  Account: ${accountId}`)

  // 2. Trouver ou créer une veille
  let { data: watches } = await admin.from('watches').select('id').eq('account_id', accountId).limit(1)
  let watchId: string

  if (watches?.length) {
    watchId = watches[0].id
  } else {
    const { data: w } = await admin.from('watches').insert({
      account_id: accountId,
      name: 'Veille BTP & Mines - Afrique de l\'Ouest',
      sectors: ['BTP', 'Mines', 'Agriculture'],
      countries: ['CI', 'SN', 'GN', 'ML'],
      frequency: 'daily',
      is_active: true,
    }).select('id').single()
    watchId = w!.id
  }
  console.log(`  Watch: ${watchId}`)

  // 3. Upsert des entreprises mock
  const companyIds: string[] = []
  for (const co of MOCK_COMPANIES) {
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
  console.log(`  ${companyIds.length} entreprises`)

  // 4. Lier entreprises à la veille
  for (const cid of companyIds) {
    await admin.from('watch_companies').upsert(
      { watch_id: watchId, company_id: cid },
      { onConflict: 'watch_id,company_id' }
    )
  }

  // 5. Générer des signaux fictifs
  let signalCount = 0
  for (const cid of companyIds) {
    const nSignals = 1 + Math.floor(Math.random() * 4)
    for (let i = 0; i < nSignals; i++) {
      const type = randomFrom(SIGNAL_TYPES)
      const title = `${type.replace(/_/g, ' ')} — signal auto-généré`
      await admin.from('signals').insert({
        watch_id: watchId,
        company_id: cid,
        signal_type: type,
        title,
        raw_content: `Signal de démonstration pour seed. Type: ${type}.`,
        collected_at: randomDate(60),
        relevance_score: 0.5 + Math.random() * 0.5,
        confidence_score: 0.3 + Math.random() * 0.7,
        is_processed: true,
      })
      signalCount++
    }
  }
  console.log(`  ${signalCount} signaux créés`)

  // 6. Recalculer les opportunités
  console.log('  🔄 Calcul des scores...')
  const result = await recomputeOpportunities(admin, accountId)
  console.log(`  ✓ ${result.created} créées, ${result.updated} mises à jour`)
  if (result.errors.length) console.log(`  ⚠️ Erreurs: ${result.errors.join('; ')}`)

  console.log('✅ Seed terminé.')
}

seed().catch(console.error)
