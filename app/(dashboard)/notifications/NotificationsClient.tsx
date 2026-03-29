'use client'

import { useState } from 'react'
import { Bell, CheckCheck, Trash2, AlertTriangle, TrendingUp, FileText, Bot, Info } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  metadata?: any
}

const typeIcons: Record<string, any> = {
  report:  FileText,
  signal:  TrendingUp,
  alert:   AlertTriangle,
  agent:   Bot,
  system:  Info,
}

const typeColors: Record<string, string> = {
  report:  'bg-blue-100 text-blue-600',
  signal:  'bg-green-100 text-green-600',
  alert:   'bg-amber-100 text-amber-600',
  agent:   'bg-purple-100 text-purple-600',
  system:  'bg-neutral-100 text-neutral-500',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Il y a ${days}j`
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export default function NotificationsClient({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const supabase = createClient()

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications

  const unreadCount = notifications.filter(n => !n.is_read).length

  async function markAsRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    await supabase.from('alerts').update({ is_read: true }).eq('id', id)
  }

  async function markAllRead() {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id)
    if (ids.length === 0) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await supabase.from('alerts').update({ is_read: true }).in('id', ids)
  }

  async function deleteNotification(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id))
    await supabase.from('alerts').delete().eq('id', id)
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center">
            <Bell size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-neutral-900">Notifications</h2>
            <p className="text-xs text-neutral-500">
              {unreadCount > 0 ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''}` : 'Tout est lu'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <CheckCheck size={14} /> Tout marquer comme lu
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(['all', 'unread'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f ? 'bg-blue-700 text-white' : 'bg-white text-neutral-600 border border-neutral-200 hover:border-blue-300'
            }`}>
            {f === 'all' ? 'Toutes' : 'Non lues'}
            {f === 'unread' && unreadCount > 0 && (
              <span className="ml-1.5 bg-white/20 text-[10px] px-1.5 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
            <Bell size={28} className="text-neutral-300" />
          </div>
          <p className="text-sm font-medium text-neutral-500 mb-1">
            {filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'}
          </p>
          <p className="text-xs text-neutral-400">
            Les notifications de vos veilles et agents apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const Icon = typeIcons[n.type] || Info
            const color = typeColors[n.type] || typeColors.system
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markAsRead(n.id)}
                className={`card-lg flex items-start gap-3 cursor-pointer transition-all hover:shadow-sm ${
                  !n.is_read ? 'border-l-2 border-l-blue-600 bg-blue-50/30' : ''
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs truncate ${!n.is_read ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5 line-clamp-2">{n.message}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-neutral-400 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); deleteNotification(n.id) }}
                        className="w-6 h-6 rounded flex items-center justify-center text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {!n.is_read && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 mt-1" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
