'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isGmailAddress, OTP_SIGNUP_STORAGE_KEY } from '@/lib/auth/email-domain'
import { Eye, EyeOff } from 'lucide-react'

function PasswordStrength({ password }: { password: string }) {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  const colors = ['bg-red-500', 'bg-amber-500', 'bg-amber-400', 'bg-green-500']
  const labels = ['Très faible', 'Faible', 'Moyen', 'Fort']

  if (!password) return null
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1,2,3,4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= score ? colors[score-1] : 'bg-neutral-200'}`} />
        ))}
      </div>
      <span className={`text-xs font-medium ${score <= 1 ? 'text-red-600' : score <= 2 ? 'text-amber-600' : 'text-green-600'}`}>
        {labels[score-1]}
      </span>
    </div>
  )
}

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return }
    setLoading(true)
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    const fullName = `${firstName} ${lastName}`.trim()

    if (isGmailAddress(normalizedEmail)) {
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        setLoading(false)
        router.push(`/verify?email=${encodeURIComponent(normalizedEmail)}`)
      }
      return
    }

    // Hors Gmail : compte créé par OTP ; le mot de passe est appliqué après validation du code.
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
        data: {
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    try {
      sessionStorage.setItem(
        OTP_SIGNUP_STORAGE_KEY,
        JSON.stringify({ email: normalizedEmail, password })
      )
    } catch {
      setError('Impossible de poursuivre dans ce navigateur (stockage bloqué).')
      setLoading(false)
      return
    }
    setLoading(false)
    router.push(`/verify-otp?email=${encodeURIComponent(normalizedEmail)}&mode=signup`)
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="w-full max-w-md">
      {/* Tab nav */}
      <div className="flex bg-white border border-neutral-200 rounded-xl p-1 mb-5 gap-1 shadow-sm">
        <button className="flex-1 py-2 text-sm font-semibold bg-neutral-900 text-white rounded-lg">
          Créer un compte
        </button>
        <Link href="/login" className="flex-1 py-2 text-sm font-medium text-neutral-500 rounded-lg text-center hover:bg-neutral-100 transition-colors">
          Se connecter
        </Link>
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm">
        <div className="p-7">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 bg-black flex items-center justify-center">
              <img src="/logo.png" alt="MarketLens" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="text-base font-bold text-neutral-900 tracking-tight">MarketLens</div>
              <div className="text-[11px] text-neutral-400">Veille concurrentielle · Afrique</div>
            </div>
          </div>

          <h1 className="text-xl font-bold text-neutral-900 tracking-tight mb-1">Créez votre compte</h1>
          <p className="text-sm text-neutral-500 mb-5">Commencez votre veille en 2 minutes.</p>
          <p className="text-xs text-neutral-400 mb-5 -mt-3 leading-relaxed">
            Adresse Gmail / Google : confirmation par lien dans l’e-mail. Autres domaines : un code à 6 chiffres vous sera envoyé pour valider la création du compte.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{error}</div>
          )}

          {/* Google */}
          <button onClick={handleGoogle} className="flex items-center justify-center gap-2.5 w-full py-2.5 border border-neutral-200 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors mb-4">
            <GoogleIcon />
            Continuer avec Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-neutral-200" />
            <span className="text-xs text-neutral-400">ou avec votre email</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>

          <form onSubmit={handleSignup} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Prénom</label>
                <input className="input" placeholder="Kouamé" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Nom</label>
                <input className="input" placeholder="Diallo" value={lastName} onChange={e => setLastName(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="label">Email professionnel</label>
              <input type="email" className="input" placeholder="kouame@entreprise.ci" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} className="input pr-10"
                  placeholder="8 caractères minimum" value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 mt-1">
              {loading ? 'Création...' : 'Créer mon compte'}
            </button>
          </form>

          {/* Social proof */}
          <div className="flex items-center gap-2.5 mt-5 pt-4 border-t border-neutral-100">
            <div className="flex">
              {['bg-blue-700','bg-amber-600','bg-green-600','bg-purple-600'].map((c, i) => (
                <div key={i} className={`w-6 h-6 rounded-full border-2 border-white -ml-1.5 first:ml-0 ${c} flex items-center justify-center text-white text-[9px] font-bold`}>
                  {['KD','AM','FB','SC'][i]}
                </div>
              ))}
            </div>
            <span className="text-xs text-neutral-500 leading-tight">
              +340 entreprises africaines<br/>font leur veille sur MarketLens
            </span>
          </div>
        </div>
      </div>

      <p className="text-center text-sm text-neutral-500 mt-4">
        Déjà un compte ?{' '}
        <Link href="/login" className="text-blue-700 font-medium hover:underline">Se connecter</Link>
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
