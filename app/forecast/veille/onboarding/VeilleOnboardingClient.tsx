'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Sparkles, Shield, Zap, Crown, Loader2 } from 'lucide-react'

interface Plan {
  name: string
  label: string
  labelEn: string
  price: number
  priceAnnual: number
  taglineFr: string
  taglineEn: string
  icon: React.ReactNode
  popular: boolean
  ring: string
  features: { text: string; textEn: string; ok: boolean | 'partial' }[]
}

const PLANS: Plan[] = [
  {
    name: 'free',
    label: 'Free',
    labelEn: 'Free',
    price: 0,
    priceAnnual: 0,
    taglineFr: 'Découvrez la veille concurrentielle',
    taglineEn: 'Discover competitive intelligence',
    icon: <Zap size={20} className="text-neutral-400" />,
    popular: false,
    ring: 'border-neutral-700 hover:border-neutral-600',
    features: [
      { text: '1 veille active', textEn: '1 active watch', ok: true },
      { text: '3 entreprises suivies', textEn: '3 tracked companies', ok: true },
      { text: '2 rapports / mois', textEn: '2 reports / month', ok: true },
      { text: 'Collecte Gemini', textEn: 'Gemini collection', ok: true },
      { text: 'Synthèse (résumé court)', textEn: 'Summary (short)', ok: 'partial' },
      { text: 'Analyse de marché', textEn: 'Market analysis', ok: false },
      { text: 'Recommandations stratégiques', textEn: 'Strategic recommendations', ok: false },
      { text: 'Assistant IA', textEn: 'AI assistant', ok: false },
      { text: 'Export PDF & Word', textEn: 'PDF & Word export', ok: false },
    ],
  },
  {
    name: 'pro',
    label: 'Pro',
    labelEn: 'Pro',
    price: 99,
    priceAnnual: 79,
    taglineFr: 'Pour les professionnels exigeants',
    taglineEn: 'For demanding professionals',
    icon: <Sparkles size={20} className="text-blue-400" />,
    popular: true,
    ring: 'border-blue-500/50 hover:border-blue-400 shadow-lg shadow-blue-500/5',
    features: [
      { text: '5 veilles simultanées', textEn: '5 simultaneous watches', ok: true },
      { text: '15 entreprises suivies', textEn: '15 tracked companies', ok: true },
      { text: '30 rapports / mois', textEn: '30 reports / month', ok: true },
      { text: 'Collecte Gemini + Search', textEn: 'Gemini + Search collection', ok: true },
      { text: 'Synthèse complète', textEn: 'Full summary', ok: true },
      { text: 'Analyse de marché', textEn: 'Market analysis', ok: true },
      { text: 'Recommandations stratégiques', textEn: 'Strategic recommendations', ok: true },
      { text: 'Assistant IA', textEn: 'AI assistant', ok: true },
      { text: 'Export PDF & Word', textEn: 'PDF & Word export', ok: true },
    ],
  },
  {
    name: 'business',
    label: 'Business',
    labelEn: 'Business',
    price: 249,
    priceAnnual: 199,
    taglineFr: 'Pour les équipes et organisations',
    taglineEn: 'For teams and organizations',
    icon: <Crown size={20} className="text-amber-400" />,
    popular: false,
    ring: 'border-amber-500/30 hover:border-amber-400/50',
    features: [
      { text: 'Veilles illimitées', textEn: 'Unlimited watches', ok: true },
      { text: '50 entreprises suivies', textEn: '50 tracked companies', ok: true },
      { text: 'Rapports illimités', textEn: 'Unlimited reports', ok: true },
      { text: 'Tous les agents IA', textEn: 'All AI agents', ok: true },
      { text: 'Assistant IA avancé', textEn: 'Advanced AI assistant', ok: true },
      { text: 'Sources documentaires étendues', textEn: 'Extended document sources', ok: true },
      { text: 'Export PDF & Word', textEn: 'PDF & Word export', ok: true },
      { text: 'Jusqu\'à 10 utilisateurs', textEn: 'Up to 10 users', ok: true },
      { text: 'Dashboard équipe', textEn: 'Team dashboard', ok: true },
    ],
  },
]

export function VeilleOnboardingClient({ locale }: { locale: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const t = (fr: string, en: string) => locale === 'fr' ? fr : en

  async function choosePlan(planName: string) {
    setLoading(planName)
    setError(null)

    try {
      const res = await fetch('/api/veille/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409 && data.redirect) {
          router.push(data.redirect)
          return
        }
        throw new Error(data.error || 'Erreur')
      }

      router.push(data.redirect || '/dashboard')
    } catch (err: any) {
      setError(err.message)
      setLoading(null)
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="text-center mb-10 max-w-xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
          <Shield size={13} className="text-blue-400" />
          <span className="text-[11px] font-semibold text-blue-400">
            {t('Veille Concurrentielle', 'Competitive Intelligence')}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          {t('Choisissez votre forfait', 'Choose your plan')}
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed">
          {t(
            'Surveillez vos concurrents, analysez les tendances de marché et recevez des recommandations stratégiques alimentées par l\'IA.',
            'Monitor your competitors, analyze market trends and receive AI-powered strategic recommendations.',
          )}
        </p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 max-w-5xl w-full mb-10">
        {PLANS.map(plan => {
          const isLoading = loading === plan.name
          return (
            <div
              key={plan.name}
              className={`relative rounded-2xl border bg-neutral-900/60 backdrop-blur-sm p-6 flex flex-col transition-all ${plan.ring}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                    {t('Le plus populaire', 'Most popular')}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                {plan.icon}
                <div>
                  <h3 className="text-lg font-bold text-white">{locale === 'fr' ? plan.label : plan.labelEn}</h3>
                  <p className="text-[11px] text-neutral-500">{locale === 'fr' ? plan.taglineFr : plan.taglineEn}</p>
                </div>
              </div>

              <div className="mb-5">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {plan.price === 0 ? '0€' : `${plan.price}€`}
                </span>
                {plan.price > 0 && <span className="text-sm text-neutral-500 ml-1">/{t('mois', 'mo')}</span>}
                {plan.priceAnnual > 0 && (
                  <p className="text-[11px] text-emerald-400/80 mt-1">
                    {t(`ou ${plan.priceAnnual}€/mois en annuel`, `or ${plan.priceAnnual}€/mo billed annually`)}
                  </p>
                )}
                {plan.price === 0 && (
                  <p className="text-[11px] text-neutral-600 mt-1">{t('Pour toujours', 'Forever')}</p>
                )}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f.text} className="flex items-start gap-2 text-xs">
                    {f.ok === true ? (
                      <Check size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : f.ok === 'partial' ? (
                      <span className="text-amber-400 flex-shrink-0 text-[10px] mt-0.5 font-bold">~</span>
                    ) : (
                      <X size={13} className="text-neutral-600 flex-shrink-0 mt-0.5" />
                    )}
                    <span className={f.ok ? 'text-neutral-300' : 'text-neutral-600'}>
                      {locale === 'fr' ? f.text : f.textEn}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => choosePlan(plan.name)}
                disabled={!!loading}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
                  plan.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
                    : plan.name === 'business'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                      : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {t('Configuration...', 'Setting up...')}
                  </span>
                ) : plan.price === 0 ? (
                  t('Commencer gratuitement', 'Start for free')
                ) : (
                  t('Essai gratuit 14 jours', '14-day free trial')
                )}
              </button>
            </div>
          )
        })}
      </div>

      {/* Payment methods */}
      <div className="text-center">
        <p className="text-[11px] text-neutral-600 mb-3">{t('Moyens de paiement acceptés', 'Accepted payment methods')}</p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {['Visa', 'Mastercard', 'Orange Money', 'Wave', 'MTN MoMo'].map(m => (
            <span key={m} className="text-[10px] px-2.5 py-1 bg-neutral-800/60 text-neutral-500 rounded-full border border-neutral-800">
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
