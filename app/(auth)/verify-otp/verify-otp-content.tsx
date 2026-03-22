'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { OTP_SIGNUP_STORAGE_KEY } from '@/lib/auth/email-domain'

type Mode = 'signup' | 'login'

export default function VerifyOtpContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const email = (searchParams.get('email') || '').trim().toLowerCase()
  const mode = (searchParams.get('mode') || 'signup') as Mode

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)

  async function handleResend() {
    if (!email) return
    setResending(true)
    setError('')
    setResent(false)
    // Après le premier envoi, l’utilisateur existe déjà : ne pas redemander shouldCreateUser: true.
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    })
    setResending(false)
    if (err) {
      setError(err.message)
      return
    }
    setResent(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setError('Adresse e-mail manquante.')
      return
    }
    const token = code.replace(/\s/g, '')
    if (token.length < 6) {
      setError('Saisissez le code à 6 chiffres reçu par e-mail.')
      return
    }

    setLoading(true)
    setError('')

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (verifyErr) {
      setError('Code invalide ou expiré. Vérifiez votre saisie ou demandez un nouveau code.')
      setLoading(false)
      return
    }

    if (mode === 'signup') {
      try {
        const raw = sessionStorage.getItem(OTP_SIGNUP_STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { password?: string; email?: string }
          if (parsed.email === email && parsed.password && parsed.password.length >= 8) {
            const { error: pwdErr } = await supabase.auth.updateUser({ password: parsed.password })
            if (pwdErr) {
              setError(
                'Compte validé, mais le mot de passe n’a pas pu être enregistré. Utilisez « Mot de passe oublié » sur la page de connexion.'
              )
              sessionStorage.removeItem(OTP_SIGNUP_STORAGE_KEY)
              setLoading(false)
              return
            }
          }
          sessionStorage.removeItem(OTP_SIGNUP_STORAGE_KEY)
        }
      } catch {
        sessionStorage.removeItem(OTP_SIGNUP_STORAGE_KEY)
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  if (!email) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 text-center">
          <p className="text-sm text-neutral-600 mb-4">Lien incomplet : aucune adresse e-mail.</p>
          <Link href="/signup" className="text-sm text-blue-700 font-medium hover:underline">
            Retour à l’inscription
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-5">
          <KeyRound size={26} className="text-blue-700" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900 tracking-tight mb-2">Code de vérification</h1>
        <p className="text-sm text-neutral-500 mb-1">
          {mode === 'signup'
            ? 'Nous avons envoyé un code à 6 chiffres à'
            : 'Saisissez le code envoyé à'}
        </p>
        <p className="text-sm font-semibold text-neutral-900 mb-6">{email}</p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700 text-left">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="label" htmlFor="otp-code">
              Code à 6 chiffres
            </label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input text-center text-lg tracking-[0.4em] font-mono"
              placeholder="000000"
              maxLength={8}
              value={code}
              onChange={e => setCode(e.target.value.replace(/[^\d]/g, ''))}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Vérification...' : mode === 'signup' ? 'Valider et créer mon compte' : 'Se connecter'}
          </button>
        </form>

        <p className="text-sm text-neutral-500 mt-5">
          Pas reçu ?{' '}
          {resent ? (
            <span className="text-green-600 font-medium">Nouveau code envoyé ✓</span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-blue-700 font-medium hover:underline"
            >
              {resending ? 'Envoi...' : 'Renvoyer le code'}
            </button>
          )}
        </p>

        <div className="mt-6 pt-4 border-t border-neutral-100">
          <Link
            href={mode === 'signup' ? '/signup' : '/login'}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            ← Retour
          </Link>
        </div>
      </div>
    </div>
  )
}
