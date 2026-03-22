'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function VerifyPage() {
  const params = useSearchParams()
  const email = params.get('email') || ''
  const supabase = createClient()
  const [resent, setResent] = useState(false)

  async function resend() {
    await supabase.auth.resend({ type: 'signup', email })
    setResent(true)
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-5">
          <Mail size={26} className="text-blue-700" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900 tracking-tight mb-2">Vérifiez votre email</h1>
        <p className="text-sm text-neutral-500 mb-1">Nous avons envoyé un lien de vérification à</p>
        <p className="text-sm font-semibold text-neutral-900 mb-6">{email}</p>

        <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 text-left mb-6 leading-relaxed">
          <strong>Étapes :</strong><br/>
          1. Ouvrez votre boîte mail<br/>
          2. Cliquez sur le lien de confirmation<br/>
          3. Vous serez redirigé vers votre dashboard
        </div>

        <p className="text-sm text-neutral-500">
          Pas reçu ?{' '}
          {resent ? (
            <span className="text-green-600 font-medium">Email renvoyé ✓</span>
          ) : (
            <button onClick={resend} className="text-blue-700 font-medium hover:underline">
              Renvoyer le code
            </button>
          )}
        </p>

        <div className="mt-6 pt-4 border-t border-neutral-100">
          <Link href="/login" className="text-sm text-neutral-500 hover:text-neutral-700">
            ← Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  )
}
