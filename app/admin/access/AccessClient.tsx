'use client'
import { useState } from 'react'
import { Plus, Tag, TestTube, Gift, Users, X, AlertCircle, Check } from 'lucide-react'

type PromoCode = {
  id: string; code: string; type: string; value: number
  used_count: number; max_uses: number | null; expires_at: string | null; is_active: boolean
}

type SpecialAccess = {
  id: string; type: string; granted_plan: string; expires_at: string
  accounts: { profiles: { email: string }[] } | null
}

type Referral = {
  id: string; ref_code: string; status: string
  profiles: { full_name: string } | null
}

type Plan = { id: string; name: string; display_name: string }

export default function AccessClient({
  initialPromoCodes, initialSpecialAccess, initialReferrals, plans,
}: {
  initialPromoCodes: PromoCode[]
  initialSpecialAccess: SpecialAccess[]
  initialReferrals: Referral[]
  plans: Plan[]
}) {
  const [promoCodes, setPromoCodes] = useState(initialPromoCodes)
  const [showPromoForm, setShowPromoForm] = useState(false)
  const [showTestForm, setShowTestForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Promo form state
  const [promoCode, setPromoCode] = useState('')
  const [promoType, setPromoType] = useState<'percent' | 'fixed'>('percent')
  const [promoValue, setPromoValue] = useState('')
  const [promoMax, setPromoMax] = useState('')
  const [promoExpiry, setPromoExpiry] = useState('')

  // Test profile form state
  const [testEmail, setTestEmail] = useState('')
  const [testPlan, setTestPlan] = useState(plans[0]?.name || 'pro')
  const [testDays, setTestDays] = useState('30')

  const activePromos = promoCodes.filter(p => p.is_active)
  const activeAccess = initialSpecialAccess.filter(a => new Date(a.expires_at) > new Date())

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    setPromoCode(Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
  }

  async function createPromo() {
    if (!promoCode.trim() || !promoValue) { setError('Code et valeur sont obligatoires'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode.toUpperCase().trim(),
          type: promoType,
          value: promoType === 'percent' ? Number(promoValue) : Math.round(Number(promoValue) * 100),
          max_uses: promoMax ? Number(promoMax) : null,
          expires_at: promoExpiry || null,
          applicable_plans: ['pro', 'business'],
          new_users_only: false,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { code: promo } = await res.json()
      setPromoCodes(prev => promo ? [promo, ...prev] : prev)
      setSuccess('Code promo créé !')
      setTimeout(() => { setShowPromoForm(false); setSuccess(''); setPromoCode(''); setPromoValue(''); setPromoMax(''); setPromoExpiry('') }, 1500)
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  async function createTestProfile() {
    if (!testEmail.trim()) { setError('Email obligatoire'); return }
    setSaving(true); setError('')
    try {
      const expires = new Date()
      expires.setDate(expires.getDate() + Number(testDays))
      const res = await fetch('/api/admin/special-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail.trim(), type: 'test_profile', granted_plan: testPlan, expires_at: expires.toISOString() }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSuccess('Accès test créé !')
      setTimeout(() => { setShowTestForm(false); setSuccess(''); setTestEmail('') }, 1500)
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la création')
    } finally {
      setSaving(false)
    }
  }

  async function togglePromo(code: PromoCode) {
    await fetch(`/api/admin/promo-codes/${code.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !code.is_active }),
    })
    setPromoCodes(prev => prev.map(p => p.id === code.id ? { ...p, is_active: !p.is_active } : p))
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Accès spéciaux</h2>
        <div className="flex gap-2">
          <button onClick={() => { setShowPromoForm(true); setError('') }} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={13} /> Code promo
          </button>
          <button onClick={() => { setShowTestForm(true); setError('') }} className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={13} /> Profil test
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Codes actifs', value: activePromos.length, icon: Tag, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Profils test actifs', value: activeAccess.length, icon: TestTube, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Upgrades offerts', value: initialSpecialAccess.filter(a => a.type === 'plan_upgrade').length, icon: Gift, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Parrainages actifs', value: initialReferrals.length, icon: Users, color: 'text-amber-700', bg: 'bg-amber-50' },
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
        {promoCodes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b border-neutral-100">
                  {['Code', 'Type', 'Valeur', 'Utilisations', 'Expiration', 'Statut', ''].map(h => (
                    <th key={h} className="text-left py-2 px-2 text-neutral-400 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {promoCodes.map(code => (
                  <tr key={code.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                    <td className="py-2.5 px-2 font-mono font-bold text-blue-700">{code.code}</td>
                    <td className="py-2.5 px-2">
                      <span className="badge badge-blue">{code.type === 'percent' ? '%' : '€ fixe'}</span>
                    </td>
                    <td className="py-2.5 px-2 font-semibold">
                      {code.type === 'percent' ? `${code.value}%` : `${(code.value/100).toFixed(0)}€`}
                    </td>
                    <td className="py-2.5 px-2 text-neutral-500">{code.used_count}/{code.max_uses || '∞'}</td>
                    <td className="py-2.5 px-2 text-neutral-500">
                      {code.expires_at ? new Date(code.expires_at).toLocaleDateString('fr-FR') : 'Jamais'}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`badge ${code.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {code.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <button
                        onClick={() => togglePromo(code)}
                        className={`text-[10px] px-2 py-1 rounded font-medium transition-colors ${code.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
                      >
                        {code.is_active ? 'Désactiver' : 'Activer'}
                      </button>
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
        {initialSpecialAccess.length > 0 ? (
          <div className="space-y-2">
            {initialSpecialAccess.map(access => {
              const isExpired = new Date(access.expires_at) < new Date()
              return (
                <div key={access.id} className={`flex items-center gap-3 p-3 rounded-lg border text-xs ${isExpired ? 'bg-neutral-50 border-neutral-200' : 'bg-green-50 border-green-200'}`}>
                  <span className={`badge ${access.type === 'test_profile' ? 'badge-green' : 'badge-purple'}`}>
                    {access.type === 'test_profile' ? 'Test' : 'Upgrade'}
                  </span>
                  <span className="font-semibold text-neutral-900 flex-1">
                    {access.accounts?.profiles?.[0]?.email || 'Compte inconnu'}
                  </span>
                  <span className="text-neutral-600">{access.granted_plan}</span>
                  <span className="text-neutral-500">expire le {new Date(access.expires_at).toLocaleDateString('fr-FR')}</span>
                  <span className={`badge ${isExpired ? 'badge-gray' : 'badge-green'}`}>{isExpired ? 'Expiré' : 'Actif'}</span>
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
        {initialReferrals.length > 0 ? (
          <div className="space-y-2">
            {initialReferrals.map(ref => (
              <div key={ref.id} className="flex items-center gap-3 p-3 rounded-lg border border-neutral-100 bg-neutral-50 text-xs">
                <span className="font-mono font-bold text-amber-700">{ref.ref_code}</span>
                <span className="text-neutral-600 flex-1">{ref.profiles?.full_name || 'Utilisateur'}</span>
                <span className={`badge ${ref.status === 'rewarded' ? 'badge-green' : ref.status === 'qualified' ? 'badge-blue' : 'badge-amber'}`}>{ref.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-400 py-4 text-center">Aucun parrainage enregistré.</p>
        )}
      </div>

      {/* Modal code promo */}
      {showPromoForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-neutral-900">Créer un code promo</h3>
              <button onClick={() => setShowPromoForm(false)} className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center"><X size={14} /></button>
            </div>
            {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700"><AlertCircle size={13} />{error}</div>}
            {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-xs text-green-700"><Check size={13} />{success}</div>}
            <div className="space-y-4">
              <div>
                <label className="label">Code promo *</label>
                <div className="flex gap-2">
                  <input className="input flex-1 font-mono uppercase" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())} placeholder="EX: LAUNCH50" />
                  <button onClick={generateCode} className="btn-ghost text-xs px-3">Générer</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={promoType} onChange={e => setPromoType(e.target.value as 'percent' | 'fixed')}>
                    <option value="percent">Pourcentage (%)</option>
                    <option value="fixed">Montant fixe (€)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Valeur {promoType === 'percent' ? '(%)' : '(€)'} *</label>
                  <input type="number" className="input" value={promoValue} onChange={e => setPromoValue(e.target.value)} placeholder={promoType === 'percent' ? '20' : '10'} min={0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Max utilisations</label>
                  <input type="number" className="input" value={promoMax} onChange={e => setPromoMax(e.target.value)} placeholder="Illimité" min={1} />
                </div>
                <div>
                  <label className="label">Expiration</label>
                  <input type="date" className="input" value={promoExpiry} onChange={e => setPromoExpiry(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowPromoForm(false)} className="btn-ghost flex-1 text-sm py-2.5">Annuler</button>
              <button onClick={createPromo} disabled={saving} className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50">
                {saving ? 'Création...' : 'Créer le code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal profil test */}
      {showTestForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-neutral-900">Créer un profil test</h3>
              <button onClick={() => setShowTestForm(false)} className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center"><X size={14} /></button>
            </div>
            {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700"><AlertCircle size={13} />{error}</div>}
            {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-xs text-green-700"><Check size={13} />{success}</div>}
            <div className="space-y-4">
              <div>
                <label className="label">Email du compte *</label>
                <input type="email" className="input" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="partenaire@exemple.com" />
              </div>
              <div>
                <label className="label">Plan accordé</label>
                <select className="input" value={testPlan} onChange={e => setTestPlan(e.target.value)}>
                  {plans.map(p => <option key={p.id} value={p.name}>{p.display_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Durée (jours)</label>
                <input type="number" className="input" value={testDays} onChange={e => setTestDays(e.target.value)} min={1} max={365} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowTestForm(false)} className="btn-ghost flex-1 text-sm py-2.5">Annuler</button>
              <button onClick={createTestProfile} disabled={saving} className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50">
                {saving ? 'Création...' : 'Créer l\'accès'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
