'use client'
import { useState } from 'react'
import { X, Check, AlertCircle } from 'lucide-react'

type User = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  accounts: { id: string; subscription_status: string; plans: { id: string; display_name: string; name: string } | null } | null
}

type Plan = { id: string; display_name: string; name: string }

export default function UserActions({ users, plans }: { users: User[]; plans: Plan[] }) {
  const [editUser, setEditUser] = useState<User | null>(null)
  const [role, setRole] = useState('')
  const [planId, setPlanId] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successId, setSuccessId] = useState<string | null>(null)

  function openEdit(user: User) {
    setEditUser(user)
    setRole(user.role || 'user')
    setPlanId(user.accounts?.plans?.id || '')
    setStatus(user.accounts?.subscription_status || 'active')
    setError('')
  }

  function close() {
    setEditUser(null)
    setError('')
  }

  async function save() {
    if (!editUser) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, planId, status, accountId: editUser.accounts?.id }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSuccessId(editUser.id)
      setTimeout(() => setSuccessId(null), 3000)
      close()
      window.location.reload()
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la modification')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-neutral-900">Modifier l&apos;utilisateur</h3>
                <p className="text-xs text-neutral-500 mt-0.5">{editUser.full_name || editUser.email}</p>
              </div>
              <button onClick={close} className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors">
                <X size={14} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">Rôle</label>
                <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                  <option value="user">user</option>
                  <option value="owner">owner</option>
                  <option value="superadmin">superadmin</option>
                </select>
              </div>

              <div>
                <label className="label">Plan</label>
                <select className="input" value={planId} onChange={e => setPlanId(e.target.value)}>
                  <option value="">— inchangé —</option>
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>{p.display_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Statut abonnement</label>
                <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="active">Actif</option>
                  <option value="trial">Essai</option>
                  <option value="canceled">Annulé</option>
                  <option value="past_due">En retard</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={close} className="btn-ghost flex-1 text-sm py-2.5">Annuler</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50">
                {saving ? 'Sauvegarde...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rows */}
      {users.map(user => {
        const plan = user.accounts?.plans
        const account = user.accounts
        return (
          <tr key={user.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
            <td className="py-3 px-4">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {user.full_name?.slice(0,2).toUpperCase() || 'ML'}
                </div>
                <span className="font-semibold text-neutral-900 text-xs">{user.full_name || '—'}</span>
              </div>
            </td>
            <td className="py-3 px-4 text-xs text-neutral-600">{user.email}</td>
            <td className="py-3 px-4">
              <span className={`badge ${
                user.role === 'superadmin' ? 'badge-red' :
                user.role === 'owner' ? 'badge-purple' : 'badge-gray'
              }`}>{user.role || 'user'}</span>
            </td>
            <td className="py-3 px-4">
              <span className={`badge ${
                plan?.name === 'business' ? 'badge-purple' :
                plan?.name === 'pro' ? 'badge-blue' : 'badge-gray'
              }`}>{plan?.display_name || 'Free'}</span>
            </td>
            <td className="py-3 px-4">
              <span className={`badge ${
                account?.subscription_status === 'active' ? 'badge-green' :
                account?.subscription_status === 'trial' ? 'badge-amber' : 'badge-gray'
              }`}>{account?.subscription_status || 'active'}</span>
            </td>
            <td className="py-3 px-4 text-xs text-neutral-500">
              {(user as any).created_at ? new Date((user as any).created_at).toLocaleDateString('fr-FR') : '—'}
            </td>
            <td className="py-3 px-4">
              <div className="flex gap-1">
                {successId === user.id && (
                  <span className="text-[10px] text-green-600 flex items-center gap-1"><Check size={11} /> Modifié</span>
                )}
                <button
                  onClick={() => openEdit(user)}
                  className="text-[10px] px-2 py-1 bg-neutral-100 text-neutral-600 rounded hover:bg-neutral-200 transition-colors font-medium"
                >
                  Modifier
                </button>
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
