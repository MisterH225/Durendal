'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  User, Mail, Building2, Shield, Save, LogOut, Key,
  CreditCard, CheckCircle2, AlertCircle, Briefcase
} from 'lucide-react'
import Link from 'next/link'

interface Props {
  user: { id: string; email: string }
  profile: any
}

export default function ProfilClient({ user, profile }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [company, setCompany] = useState(profile?.company || '')
  const [jobTitle, setJobTitle] = useState(profile?.job_title || '')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const planName = profile?.accounts?.plans?.display_name || 'Free'
  const planBadge = planName === 'Free' ? 'badge-gray' : planName === 'Pro' ? 'badge-blue' : 'badge-purple'
  const initials = fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'ML'

  const hasOrganization = !!profile?.accounts?.name

  async function handleSaveProfile() {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updateData: Record<string, any> = { full_name: fullName.trim() }
      if (!hasOrganization) {
        updateData.company = company.trim() || null
        updateData.job_title = jobTitle.trim() || null
      }
      const { error: err } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
      if (err) throw err
      setSuccess('Profil mis à jour')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    setPasswordError('')
    setPasswordSuccess('')
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('Le mot de passe doit faire au moins 6 caractères')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas')
      return
    }
    setPasswordSaving(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPassword })
      if (err) throw err
      setPasswordSuccess('Mot de passe modifié avec succès')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(''), 3000)
    } catch (e: any) {
      setPasswordError(e.message || 'Erreur lors du changement de mot de passe')
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-blue-700 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <h2 className="text-base font-bold text-neutral-900">{fullName || 'Mon profil'}</h2>
          <p className="text-xs text-neutral-500">{user.email}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`badge ${planBadge}`}>{planName}</span>
            {!hasOrganization && (company || jobTitle) && (
              <span className="text-[11px] text-neutral-400">
                {[jobTitle, company].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Informations personnelles */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <User size={15} className="text-blue-700" /> Informations personnelles
          </h3>

          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-2.5 mb-4 text-xs text-green-700">
              <CheckCircle2 size={13} /> {success}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-4 text-xs text-red-700">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="label">Nom complet</label>
              <input
                className="input"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Votre nom complet"
              />
            </div>
            <div>
              <label className="label">Adresse email</label>
              <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5">
                <Mail size={14} className="text-neutral-400" />
                <span className="text-sm text-neutral-600">{user.email}</span>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">L&apos;email ne peut pas être modifié ici.</p>
            </div>
            <div>
              <label className="label">Rôle</label>
              <div className="flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2.5">
                <Shield size={14} className="text-neutral-400" />
                <span className="text-sm text-neutral-600 capitalize">{profile?.role || 'member'}</span>
              </div>
            </div>

            {!hasOrganization && (
              <>
                <div>
                  <label className="label">Entreprise</label>
                  <div className="relative">
                    <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      className="input pl-9"
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="Nom de votre entreprise"
                    />
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1">L&apos;entreprise pour laquelle vous travaillez.</p>
                </div>
                <div>
                  <label className="label">Fonction / Poste</label>
                  <div className="relative">
                    <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                      className="input pl-9"
                      value={jobTitle}
                      onChange={e => setJobTitle(e.target.value)}
                      placeholder="Ex: Directeur commercial, Analyste marché..."
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving || !fullName.trim()}
            className="btn-primary flex items-center gap-1.5 text-sm mt-4 disabled:opacity-40"
          >
            {saving ? 'Sauvegarde...' : <><Save size={14} /> Enregistrer</>}
          </button>
        </div>

        {/* Changer le mot de passe */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <Key size={15} className="text-blue-700" /> Changer le mot de passe
          </h3>

          {passwordSuccess && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-2.5 mb-4 text-xs text-green-700">
              <CheckCircle2 size={13} /> {passwordSuccess}
            </div>
          )}
          {passwordError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-4 text-xs text-red-700">
              <AlertCircle size={13} /> {passwordError}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="label">Nouveau mot de passe</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
              />
            </div>
            <div>
              <label className="label">Confirmer le mot de passe</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Retapez le mot de passe"
              />
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={passwordSaving || !newPassword}
            className="btn-primary flex items-center gap-1.5 text-sm mt-4 disabled:opacity-40"
          >
            {passwordSaving ? 'Modification...' : <><Key size={14} /> Modifier le mot de passe</>}
          </button>
        </div>

        {/* Plan & abonnement */}
        <div className="card-lg">
          <h3 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <CreditCard size={15} className="text-blue-700" /> Abonnement
          </h3>
          <div className="flex items-center justify-between bg-neutral-50 rounded-lg p-3 mb-3">
            <div>
              <span className="text-xs font-semibold text-neutral-900">Plan actuel</span>
              <span className={`badge ml-2 ${planBadge}`}>{planName}</span>
            </div>
            <Link href="/forfait" className="text-xs font-medium text-blue-700 hover:text-blue-800 transition-colors">
              Gérer le forfait →
            </Link>
          </div>
          {profile?.accounts?.plans?.name === 'free' && (
            <p className="text-[11px] text-neutral-500">
              Passez au plan Pro pour débloquer toutes les fonctionnalités : 5 veilles simultanées, tous les agents IA, export PDF et bien plus.
            </p>
          )}
        </div>

        {/* Organisation */}
        {profile?.accounts?.name && (
          <div className="card-lg">
            <h3 className="text-sm font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <Building2 size={15} className="text-blue-700" /> Organisation
            </h3>
            <div className="bg-neutral-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-neutral-900">{profile.accounts.name}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Compte ID: {profile.account_id}
              </div>
            </div>
          </div>
        )}

        {/* Déconnexion */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl py-3 transition-colors"
        >
          <LogOut size={15} /> Se déconnecter
        </button>
      </div>
    </div>
  )
}
