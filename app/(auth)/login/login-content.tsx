'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isGmailAddress } from '@/lib/auth/email-domain'
import { Eye, EyeOff, AlertCircle } from 'lucide-react'

export default function LoginContent() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const err = searchParams.get('error')
    if (err) setError(decodeURIComponent(err))
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const normalized = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithPassword({ email: normalized, password })
    if (error) {
      setError('Email ou mot de passe incorrect. Vérifiez vos informations.')
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    })
  }

  async function handleLoginWithOtp() {
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      setError('Indiquez d’abord votre adresse e-mail.')
      return
    }
    if (isGmailAddress(normalized)) {
      setError('La connexion par code e-mail est réservée aux adresses hors Gmail. Utilisez le mot de passe ou Google.')
      return
    }
    setOtpLoading(true)
    setError('')
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false },
    })
    setOtpLoading(false)
    if (otpError) {
      setError(otpError.message)
      return
    }
    window.location.href = `/verify-otp?email=${encodeURIComponent(normalized)}&mode=login`
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex bg-white border border-neutral-200 rounded-xl p-1 mb-5 gap-1 shadow-sm">
        <Link href="/signup" className="flex-1 py-2 text-sm font-medium text-neutral-500 rounded-lg text-center hover:bg-neutral-100 transition-colors">
          Créer un compte
        </Link>
        <button className="flex-1 py-2 text-sm font-semibold bg-neutral-900 text-white rounded-lg" type="button">
          Se connecter
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-7">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 bg-black flex items-center justify-center">
              <img src="/logo.png" alt="MarketLens" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="text-base font-bold text-neutral-900 tracking-tight">MarketLens</div>
              <div className="text-[11px] text-neutral-400">Veille concurrentielle · Afrique</div>
            </div>
          </div>

          <h1 className="text-xl font-bold text-neutral-900 tracking-tight mb-1">Bon retour 👋</h1>
          <p className="text-sm text-neutral-500 mb-5">Connectez-vous pour accéder à vos veilles.</p>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button onClick={handleGoogle} className="flex items-center justify-center gap-2.5 w-full py-2.5 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-900 bg-white hover:bg-neutral-50 transition-colors mb-4">
            <GoogleIcon />
            Continuer avec Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-xs text-neutral-400">ou avec votre email</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" placeholder="kouame@entreprise.ci"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} className="input pr-10"
                  placeholder="Votre mot de passe"
                  value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                  className="accent-blue-700" />
                Se souvenir de moi
              </label>
              <Link href="/reset" className="text-sm text-blue-700 hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

            {!isGmailAddress(email.trim()) && email.includes('@') && (
              <div className="pt-2 border-t border-neutral-100 mt-4">
                <p className="text-xs text-neutral-500 mb-2 text-center">Adresse professionnelle ou autre que Gmail</p>
                <button
                  type="button"
                  onClick={handleLoginWithOtp}
                  disabled={otpLoading}
                  className="w-full py-2.5 text-sm font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  {otpLoading ? 'Envoi du code...' : 'Recevoir un code par e-mail'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      <p className="text-center text-sm text-neutral-500 mt-4">
        Pas encore de compte ?{' '}
        <Link href="/signup" className="text-blue-700 font-medium hover:underline">Créer un compte</Link>
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
