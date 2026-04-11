'use client'

import { useState } from 'react'
import { Award, Users, Zap, Gift, Crown, Trophy, Target, Flame } from 'lucide-react'

const TIER_COLORS: Record<string, string> = {
  bronze: 'bg-orange-100 text-orange-800',
  silver: 'bg-gray-100 text-gray-800',
  gold: 'bg-amber-100 text-amber-800',
  platinum: 'bg-cyan-100 text-cyan-800',
  elite: 'bg-purple-100 text-purple-800',
}

const TIER_LABELS: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Argent',
  gold: 'Or',
  platinum: 'Platine',
  elite: 'Elite',
}

const CATEGORY_ICONS: Record<string, typeof Award> = {
  onboarding: Target,
  participation: Users,
  accuracy: Target,
  expertise: Crown,
  early_signal: Zap,
  consistency: Flame,
  prestige: Trophy,
  reasoning: Award,
}

interface Props {
  stats: {
    usersCount: number
    badgesAwarded: number
    activeUnlocks: number
    totalXP: number
    tierDistribution: Record<string, number>
  }
  badges: any[]
  users: any[]
}

export default function RewardsAdminClient({ stats, badges, users }: Props) {
  const [tab, setTab] = useState<'overview' | 'users' | 'badges' | 'grant'>('overview')
  const [grantUserId, setGrantUserId] = useState('')
  const [grantDays, setGrantDays] = useState(7)
  const [grantReason, setGrantReason] = useState('')
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantMsg, setGrantMsg] = useState('')

  async function handleGrant() {
    if (!grantUserId || !grantReason) return
    setGrantLoading(true)
    setGrantMsg('')
    try {
      const res = await fetch('/api/admin/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grant_pro', userId: grantUserId, days: grantDays, reason: grantReason }),
      })
      const data = await res.json()
      setGrantMsg(data.message ?? data.error ?? 'Erreur')
    } finally {
      setGrantLoading(false)
    }
  }

  const tabs = [
    { key: 'overview', label: 'Vue d\'ensemble' },
    { key: 'users', label: 'Utilisateurs' },
    { key: 'badges', label: 'Badges' },
    { key: 'grant', label: 'Attribution manuelle' },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Systeme de Recompenses</h2>
        <p className="text-sm text-neutral-500 mt-1">Gestion des points, badges, tiers et acces Pro</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Profils reward" value={stats.usersCount} />
            <StatCard icon={Award} label="Badges attribues" value={stats.badgesAwarded} />
            <StatCard icon={Gift} label="Unlocks actifs" value={stats.activeUnlocks} />
            <StatCard icon={Zap} label="XP total distribue" value={stats.totalXP.toLocaleString()} />
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-5">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">Distribution des tiers</h3>
            <div className="flex gap-3 flex-wrap">
              {['bronze', 'silver', 'gold', 'platinum', 'elite'].map(tier => (
                <div key={tier} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-4 py-3 border border-neutral-200">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[tier]}`}>
                    {TIER_LABELS[tier]}
                  </span>
                  <span className="text-lg font-bold text-neutral-900">{stats.tierDistribution[tier] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Users tab */}
      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                <th className="text-left px-4 py-3 font-semibold text-neutral-600">#</th>
                <th className="text-left px-3 py-3 font-semibold text-neutral-600">Utilisateur</th>
                <th className="text-right px-3 py-3 font-semibold text-neutral-600">XP</th>
                <th className="text-right px-3 py-3 font-semibold text-neutral-600">Niveau</th>
                <th className="text-center px-3 py-3 font-semibold text-neutral-600">Tier</th>
                <th className="text-right px-3 py-3 font-semibold text-neutral-600">Previsions</th>
                <th className="text-right px-3 py-3 font-semibold text-neutral-600">Brier moy.</th>
                <th className="text-right px-4 py-3 font-semibold text-neutral-600">Serie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u, i) => (
                <tr key={u.user_id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2.5 text-neutral-400 font-mono">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-neutral-900">{u.full_name}</div>
                    <div className="text-xs text-neutral-400">{u.email}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-neutral-800">{u.total_xp.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right text-neutral-600">{u.level}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${TIER_COLORS[u.tier] ?? 'bg-neutral-100'}`}>
                      {TIER_LABELS[u.tier] ?? u.tier}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-neutral-600">{u.forecasts_submitted}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-neutral-600">
                    {u.avg_brier_score?.toFixed(3) ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {u.current_streak > 0 && (
                      <span className="inline-flex items-center gap-1 text-orange-600 font-medium">
                        <Flame size={12} />{u.current_streak}j
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length && (
            <div className="text-center py-12 text-neutral-400">Aucun profil reward pour l&apos;instant.</div>
          )}
        </div>
      )}

      {/* Badges tab */}
      {tab === 'badges' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {badges.map(b => {
            const IconComp = CATEGORY_ICONS[b.category] ?? Award
            return (
              <div key={b.id} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${TIER_COLORS[b.tier] ?? 'bg-neutral-100 text-neutral-600'}`}>
                  <IconComp size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 text-sm">{b.name_fr}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TIER_COLORS[b.tier]}`}>{TIER_LABELS[b.tier]}</span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">{b.description_fr}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-blue-600">+{b.points_value} XP</div>
                  <div className="text-[10px] text-neutral-400 capitalize">{b.category.replace('_', ' ')}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Manual grant tab */}
      {tab === 'grant' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6 max-w-lg space-y-4">
          <h3 className="text-sm font-semibold text-neutral-800">Attribuer des jours Pro manuellement</h3>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">User ID (UUID)</label>
            <input type="text" value={grantUserId} onChange={e => setGrantUserId(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" placeholder="uuid..." />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Nombre de jours</label>
            <input type="number" value={grantDays} onChange={e => setGrantDays(Number(e.target.value))}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" min={1} max={365} />
          </div>
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Raison</label>
            <input type="text" value={grantReason} onChange={e => setGrantReason(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm" placeholder="Récompense top performer Q1..." />
          </div>
          <button onClick={handleGrant} disabled={grantLoading || !grantUserId || !grantReason}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {grantLoading ? 'Attribution...' : 'Attribuer Pro'}
          </button>
          {grantMsg && <p className="text-sm text-green-600">{grantMsg}</p>}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Award; label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center gap-2 text-neutral-400 mb-2">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold text-neutral-900">{value}</div>
    </div>
  )
}
