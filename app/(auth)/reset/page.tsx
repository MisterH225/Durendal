'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, CheckCircle } from 'lucide-react'

export default function ResetPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSent(true)
    setLoading(false)
  }

  if (sent) return (
    <div className="w-full max-w-md">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle size={26} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900 mb-2">Email envoyé !</h1>
        <p className="text-sm text-neutral-500 mb-6">
          Consultez votre boîte mail et cliquez sur le lien pour réinitialiser votre mot de passe.
        </p>
        <Link href="/login" className="btn-primary inline-block">Retour à la connexion</Link>
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-md">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-7">
        <Link href="/login" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-5">
          <ArrowLeft size={14} /> Retour à la connexion
        </Link>
        <h1 className="text-xl font-bold text-neutral-900 tracking-tight mb-1">Réinitialiser</h1>
        <p className="text-sm text-neutral-500 mb-5">
          Entrez votre email pour recevoir un lien de réinitialisation.
        </p>
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" placeholder="kouame@entreprise.ci"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
            {loading ? 'Envoi...' : 'Envoyer le lien'}
          </button>
        </form>
      </div>
    </div>
  )
}
