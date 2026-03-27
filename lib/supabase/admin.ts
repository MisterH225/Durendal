import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase avec la clé service_role.
 * Contourne complètement le RLS — à utiliser UNIQUEMENT côté serveur (API Routes).
 * Ne jamais importer dans du code client.
 */
export function createAdminClient() {
  const url    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL manquant')

  // Si la clé service_role est absente, on retombe sur la clé anon
  // (les policies RLS de la migration 005 prennent alors le relais)
  const key = svcKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
