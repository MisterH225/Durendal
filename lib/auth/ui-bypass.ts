/**
 * Mode prévisualisation UI : désactive les contrôles d’auth côté middleware et layouts.
 * À utiliser uniquement en local ou brièvement sur un serveur de test.
 *
 * Définir dans .env.local ou sur le VPS : AUTH_UI_BYPASS=true
 * Puis rebuild + restart. Désactiver (false ou supprimer) avant mise en prod réelle.
 *
 * Limite : les pages qui chargent des données via Supabase avec RLS peuvent rester vides ou en erreur.
 */

export function isAuthUiBypassEnabled(): boolean {
  return process.env.AUTH_UI_BYPASS === 'true'
}

/** Profil factice pour le layout dashboard en mode prévisualisation */
export function getBypassDashboardProfile() {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    full_name: 'Prévisualisation',
    role: 'user',
    account_id: null,
    accounts: {
      id: null,
      plans: {
        name: 'free',
        display_name: 'Free',
        agents_enabled: [1, 2] as number[],
      },
    },
  } as const
}

/** Profil factice pour le layout admin en mode prévisualisation */
export function getBypassAdminProfile() {
  return {
    role: 'superadmin' as const,
    full_name: 'Prévisualisation Admin',
  }
}
