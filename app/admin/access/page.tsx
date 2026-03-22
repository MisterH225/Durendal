import { createClient } from '@/lib/supabase/server'
import { Plus, Tag, TestTube, Gift, Users } from 'lucide-react'

export default async function AdminAccessPage() {
  const supabase = createClient()

  const { data: promoCodes } = await supabase
    .from('promo_codes').select('*').order('created_at', { ascending: false })

  const { data: specialAccess } = await supabase
    .from('special_access').select('*, accounts(profiles(full_name, email))').order('created_at', { ascending: false })

  const { data: referrals } = await supabase
    .from('referrals').select('*, profiles!referrer_id(full_name)').order('created_at', { ascending: false })

  const activePromos = promoCodes?.filter(p => p.is_active) || []
  const activeAccess = specialAccess?.filter((a: any) => new Date(a.expires_at) > new Date()) || []

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Accès spéciaux</h2>
        <div className="flex gap-2">
          <button className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={13} /> Code promo
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={13} /> Profil test
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Codes actifs', value: activePromos.length, icon: Tag, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Profils test actifs', value: activeAccess.length, icon: TestTube, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Upgrades offerts', value: specialAccess?.filter((a: any) => a.type === 'plan_upgrade').length || 0, icon: Gift, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Parrainages actifs', value: referrals?.length || 0, icon: Users, color: 'text-amber-700', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={13} className={color} />
              </div>
              <span className="text-xs text-neutral-500">{label}</span>
            </div>
            <div className="text-xl font-bold text-neutral-900">{value}</div>
          </div>
        ))}
      </div>

      {/* Promo codes table */}
      <div className="card-lg mb-4">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Codes promo</h3>
        {promoCodes && promoCodes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-neutral-100">
                  {['Code', 'Type', 'Valeur', 'Utilisations', 'Expiration', 'Statut'].map(h => (
                    <th key={h} className="text-left py-2 px-2 text-neutral-400 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promoCodes.map((code: any) => (
                  <tr key={code.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                    <td className="py-2.5 px-2 font-mono font-bold text-blue-700">{code.code}</td>
                    <td className="py-2.5 px-2">
                      <span className="badge badge-blue">{code.type === 'percent' ? '%' : '€ fixe'}</span>
                    </td>
                    <td className="py-2.5 px-2 font-semibold">
                      {code.type === 'percent' ? `${code.value}%` : `${(code.value/100).toFixed(0)}€`}
                    </td>
                    <td className="py-2.5 px-2 text-neutral-500">
                      {code.used_count}/{code.max_uses || '∞'}
                    </td>
                    <td className="py-2.5 px-2 text-neutral-500">
                      {code.expires_at ? new Date(code.expires_at).toLocaleDateString('fr-FR') : 'Jamais'}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`badge ${code.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {code.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-neutral-400 py-4 text-center">Aucun code promo créé.</p>
        )}
      </div>

      {/* Special access table */}
      <div className="card-lg mb-4">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Profils test & upgrades</h3>
        {specialAccess && specialAccess.length > 0 ? (
          <div className="space-y-2">
            {specialAccess.map((access: any) => {
              const isExpired = new Date(access.expires_at) < new Date()
              return (
                <div key={access.id} className={`flex items-center gap-3 p-3 rounded-lg border text-xs
                  ${isExpired ? 'bg-neutral-50 border-neutral-200' : 'bg-green-50 border-green-200'}`}>
                  <span className={`badge ${access.type === 'test_profile' ? 'badge-green' : 'badge-purple'}`}>
                    {access.type === 'test_profile' ? 'Test' : 'Upgrade'}
                  </span>
                  <span className="font-semibold text-neutral-900 flex-1">
                    {(access.accounts as any)?.profiles?.[0]?.email || 'Compte inconnu'}
                  </span>
                  <span className="text-neutral-600">{access.granted_plan}</span>
                  <span className="text-neutral-500">
                    expire le {new Date(access.expires_at).toLocaleDateString('fr-FR')}
                  </span>
                  <span className={`badge ${isExpired ? 'badge-gray' : 'badge-green'}`}>
                    {isExpired ? 'Expiré' : 'Actif'}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-400 py-4 text-center">Aucun accès spécial configuré.</p>
        )}
      </div>

      {/* Referrals */}
      <div className="card-lg">
        <h3 className="text-sm font-bold text-neutral-900 mb-4">Parrainages</h3>
        {referrals && referrals.length > 0 ? (
          <div className="space-y-2">
            {referrals.map((ref: any) => (
              <div key={ref.id} className="flex items-center gap-3 p-3 rounded-lg border border-neutral-100 bg-neutral-50 text-xs">
                <span className="font-mono font-bold text-amber-700">{ref.ref_code}</span>
                <span className="text-neutral-600 flex-1">{(ref.profiles as any)?.full_name || 'Utilisateur'}</span>
                <span className={`badge ${
                  ref.status === 'rewarded' ? 'badge-green' :
                  ref.status === 'qualified' ? 'badge-blue' : 'badge-amber'
                }`}>{ref.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400 py-4 text-center">Aucun parrainage enregistré.</p>
        )}
      </div>
    </div>
  )
}
