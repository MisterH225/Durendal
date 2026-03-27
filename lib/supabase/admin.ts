import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase avec la service role key.
 * Bypass total du RLS — utiliser UNIQUEMENT dans les API routes serveur.
 * Ne jamais exposer côté client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY manquant. Ajoutez-le dans .env.local depuis : ' +
      'Supabase Dashboard → Settings → API → service_role (secret)'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
