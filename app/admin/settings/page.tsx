import { createClient } from '@/lib/supabase/server'
import { Settings, Mail, Globe, Shield, Database, Bell, Code } from 'lucide-react'

export default async function AdminSettingsPage() {
  const supabase = createClient()

  const [
    { count: totalUsers },
    { count: totalWatches },
    { count: totalSignals },
    { count: totalReports },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('watches').select('*', { count: 'exact', head: true }),
    supabase.from('signals').select('*', { count: 'exact', head: true }),
    supabase.from('reports').select('*', { count: 'exact', head: true }),
  ])

  const sections = [
    {
      icon: Globe,
      title: 'Site & Domaine',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      fields: [
        { label: 'Nom du SaaS', value: 'MarketLens', type: 'text', hint: 'Affiché dans les emails et l\'interface' },
        { label: 'Domaine principal', value: 'durendal.pro', type: 'text', hint: 'Utilisé pour les liens de callback OAuth' },
        { label: 'URL de base', value: 'https://durendal.pro', type: 'text', hint: 'NEXT_PUBLIC_APP_URL' },
      ],
    },
    {
      icon: Mail,
      title: 'Email & SMTP',
      color: 'text-green-600',
      bg: 'bg-green-50',
      fields: [
        { label: 'Email expéditeur', value: 'noreply@durendal.pro', type: 'email', hint: 'Expéditeur des emails transactionnels' },
        { label: 'Nom expéditeur', value: 'MarketLens', type: 'text', hint: 'Nom affiché dans la boîte de réception' },
        { label: 'Serveur SMTP', value: '', type: 'text', hint: 'Configurable dans Supabase → Auth → SMTP' },
      ],
    },
    {
      icon: Shield,
      title: 'Sécurité & Auth',
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      fields: [
        { label: 'Email SuperAdmin', value: 'harold.bagui@gmail.com', type: 'email', hint: 'SUPERADMIN_EMAIL — défini dans .env.production' },
        { label: 'Session expiration', value: '7 jours', type: 'text', hint: 'Configurable dans Supabase → Auth → Settings' },
        { label: 'OTP durée', value: '60 minutes', type: 'text', hint: 'Configurable dans Supabase → Auth → Settings' },
      ],
    },
    {
      icon: Code,
      title: 'APIs & Clés',
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      fields: [
        { label: 'Supabase URL', value: 'https://wjrjnhaognyxcfnnaqgn.supabase.co', type: 'text', hint: 'NEXT_PUBLIC_SUPABASE_URL' },
        { label: 'Anthropic (Claude)', value: '••••••••••••••••', type: 'password', hint: 'ANTHROPIC_API_KEY — pour les agents IA' },
        { label: 'Firecrawl', value: '••••••••••••••••', type: 'password', hint: 'FIRECRAWL_API_KEY — pour le scraping' },
      ],
    },
  ]

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-neutral-900">Paramètres généraux</h2>
        <span className="text-xs text-neutral-400 flex items-center gap-1.5">
          <Settings size={12} /> Configuration du SaaS
        </span>
      </div>

      {/* Database health */}
      <div className="card-lg mb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
            <Database size={15} className="text-green-600" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900">État de la base de données</h3>
          <span className="badge badge-green ml-auto text-[10px]">Connectée</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Utilisateurs', value: totalUsers || 0 },
            { label: 'Veilles', value: totalWatches || 0 },
            { label: 'Signaux', value: totalSignals || 0 },
            { label: 'Rapports', value: totalReports || 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-neutral-50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-neutral-900">{value}</div>
              <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings sections */}
      <div className="space-y-5">
        {sections.map(({ icon: Icon, title, color, bg, fields }) => (
          <div key={title} className="card-lg">
            <div className="flex items-center gap-2.5 mb-5">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={15} className={color} />
              </div>
              <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
            </div>

            <div className="space-y-4">
              {fields.map(({ label, value, type, hint }) => (
                <div key={label}>
                  <label className="label">{label}</label>
                  <input
                    type={type}
                    defaultValue={value}
                    readOnly={type === 'password'}
                    className={`input text-sm ${type === 'password' ? 'font-mono text-neutral-400 cursor-not-allowed' : ''}`}
                  />
                  <p className="text-[11px] text-neutral-400 mt-1">{hint}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Notifications */}
      <div className="card-lg mt-5">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Bell size={15} className="text-blue-600" />
          </div>
          <h3 className="text-sm font-bold text-neutral-900">Alertes administrateur</h3>
        </div>

        <div className="space-y-3">
          {[
            { label: 'Nouveaux inscriptions', desc: 'Être notifié par email à chaque nouvel utilisateur', defaultChecked: true },
            { label: 'Erreurs agents IA', desc: 'Alerte si un agent échoue 3 fois de suite', defaultChecked: true },
            { label: 'Nouvelles conversions', desc: 'Notification quand un utilisateur passe à un plan payant', defaultChecked: true },
            { label: 'Résiliations', desc: 'Notification en cas d\'annulation d\'abonnement', defaultChecked: false },
          ].map(({ label, desc, defaultChecked }) => (
            <div key={label} className="flex items-start gap-3 py-2.5 border-b border-neutral-50 last:border-0">
              <input type="checkbox" defaultChecked={defaultChecked}
                className="mt-0.5 accent-blue-700 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-neutral-900">{label}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance */}
      <div className="card-lg mt-5 border border-red-100 bg-red-50/30">
        <h3 className="text-sm font-bold text-neutral-900 mb-1">Mode maintenance</h3>
        <p className="text-xs text-neutral-500 mb-4">
          Affiche une page de maintenance à tous les utilisateurs non-admin. Les données restent accessibles via Supabase.
        </p>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors">
            Activer le mode maintenance
          </button>
          <span className="text-xs text-neutral-400">Actuellement : <strong className="text-green-600">Désactivé</strong></span>
        </div>
      </div>

      <p className="text-[11px] text-neutral-400 mt-5">
        Les champs marqués comme variables d&apos;environnement sont en lecture seule ici. Modifiez-les dans <code className="bg-neutral-100 px-1 rounded">.env.production</code> sur le VPS puis relancez <code className="bg-neutral-100 px-1 rounded">pm2 restart durendal</code>.
      </p>
    </div>
  )
}
