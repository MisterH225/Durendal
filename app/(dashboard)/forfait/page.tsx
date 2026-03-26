import { createClient } from '@/lib/supabase/server'
import { Check, X } from 'lucide-react'

const plans = [
  {
    name: 'free', label: 'Free', price: 0, priceAnnual: 0,
    tagline: 'Pour découvrir MarketLens',
    badge: null, badgeColor: '',
    features: [
      { text: '1 veille active', ok: true },
      { text: '3 entreprises suivies', ok: true },
      { text: '2 rapports / mois', ok: true },
      { text: 'Agent 1 — Scraping web', ok: true },
      { text: 'Agent 2 — Synthèse (résumé court)', ok: 'partial' },
      { text: 'Agent 3 — Analyse de marché', ok: false },
      { text: 'Agent 4 — Recommandations', ok: false },
      { text: 'Assistant IA conversationnel', ok: false },
      { text: 'Sources documentaires', ok: false },
      { text: 'Export PDF & Word', ok: false },
      { text: 'Gestion d\'équipe', ok: false },
      { text: 'Support : FAQ uniquement', ok: true },
    ]
  },
  {
    name: 'pro', label: 'Pro', price: 99, priceAnnual: 79,
    tagline: 'Pour les professionnels',
    badge: 'Le plus populaire', badgeColor: 'badge-blue',
    features: [
      { text: '5 veilles simultanées', ok: true },
      { text: '15 entreprises suivies', ok: true },
      { text: '30 rapports / mois', ok: true },
      { text: 'Agent 1 — Scraping web', ok: true },
      { text: 'Agent 2 — Synthèse complète', ok: true },
      { text: 'Agent 3 — Analyse de marché', ok: true },
      { text: 'Agent 4 — Recommandations', ok: true },
      { text: 'Assistant IA conversationnel', ok: true },
      { text: 'Sources documentaires', ok: true },
      { text: 'Export PDF & Word', ok: true },
      { text: 'Gestion d\'équipe', ok: false },
      { text: 'Support : live chat (heures ouvrées)', ok: true },
    ]
  },
  {
    name: 'business', label: 'Business', price: 249, priceAnnual: 199,
    tagline: 'Pour les équipes',
    badge: 'Pour les équipes', badgeColor: 'badge-purple',
    features: [
      { text: 'Veilles illimitées', ok: true },
      { text: '50 entreprises suivies', ok: true },
      { text: 'Rapports illimités', ok: true },
      { text: 'Tous les agents IA', ok: true },
      { text: 'Assistant IA conversationnel', ok: true },
      { text: 'Sources documentaires + douanières', ok: true },
      { text: 'Export PDF & Word', ok: true },
      { text: 'Jusqu\'à 10 utilisateurs', ok: true },
      { text: 'Rôles Owner / Éditeur / Lecteur', ok: true },
      { text: 'Veilles partagées en équipe', ok: true },
      { text: 'Dashboard équipe consolidé', ok: true },
      { text: 'Support : prioritaire 7j/7 + gestionnaire', ok: true },
    ]
  },
]

export default async function ForfaitPage() {
  const supabase = createClient()
  let user: any = null
  try { const { data } = await supabase.auth.getUser(); user = data.user } catch {}
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles').select('account_id, accounts(*, plans(*))').eq('id', user.id).single()

  const currentPlan = (profile?.accounts as any)?.plans?.name || 'free'

  return (
    <div className="max-w-5xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Choisissez votre forfait</h2>
        <p className="text-sm text-neutral-500">14 jours gratuits sur Pro et Business · Annulable à tout moment</p>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {plans.map(plan => {
          const isCurrent = plan.name === currentPlan
          const isPro = plan.name === 'pro'
          return (
            <div key={plan.name} className={`bg-white border rounded-xl overflow-hidden flex flex-col
              ${isPro ? 'border-blue-700 border-2 shadow-md' : 'border-neutral-200 shadow-sm'}`}>

              <div className="p-5">
                {plan.badge && (
                  <span className={`badge ${plan.badgeColor} mb-3 inline-block`}>{plan.badge}</span>
                )}
                <h3 className="text-lg font-bold text-neutral-900 mb-1">{plan.label}</h3>
                <p className="text-xs text-neutral-500 mb-4">{plan.tagline}</p>

                <div className="mb-1">
                  <span className="text-3xl font-bold text-neutral-900 tracking-tight">{plan.price === 0 ? '0€' : `${plan.price}€`}</span>
                  {plan.price > 0 && <span className="text-sm text-neutral-400">/mois</span>}
                </div>
                {plan.priceAnnual > 0 && (
                  <p className="text-xs text-green-600 font-medium mb-4">ou {plan.priceAnnual}€/mois en annuel</p>
                )}
                {plan.price === 0 && <p className="text-xs text-neutral-400 mb-4">Pour toujours</p>}

                {isCurrent ? (
                  <button className="w-full py-2.5 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-500 cursor-default border border-neutral-200">
                    Plan actuel ✓
                  </button>
                ) : plan.price === 0 ? (
                  <button className="w-full py-2.5 rounded-lg text-sm font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-200 transition-colors">
                    Passer en Free
                  </button>
                ) : (
                  <button className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors
                    ${isPro ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-neutral-900 text-white hover:bg-neutral-700'}`}>
                    Commencer l'essai gratuit
                  </button>
                )}
              </div>

              <div className="px-5 pb-5 border-t border-neutral-100 pt-4 flex-1">
                <ul className="space-y-2.5">
                  {plan.features.map(({ text, ok }) => (
                    <li key={text} className="flex items-start gap-2 text-xs">
                      {ok === true ? (
                        <Check size={13} className="text-green-600 flex-shrink-0 mt-0.5" />
                      ) : ok === 'partial' ? (
                        <span className="text-amber-500 flex-shrink-0 text-[10px] mt-0.5 font-bold">~</span>
                      ) : (
                        <X size={13} className="text-neutral-300 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={ok ? 'text-neutral-700' : 'text-neutral-400'}>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )
        })}
      </div>

      {/* Paiement */}
      <div className="card text-center">
        <p className="text-xs text-neutral-500 mb-3">Moyens de paiement acceptés</p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {['Visa', 'Mastercard', 'Orange Money', 'Wave', 'MTN MoMo', 'Virement'].map(m => (
            <span key={m} className="text-xs px-3 py-1.5 bg-neutral-100 text-neutral-600 rounded-full font-medium">{m}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
