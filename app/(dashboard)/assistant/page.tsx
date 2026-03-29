'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Sparkles, Trash2, AlertCircle, ExternalLink, Eye, ArrowRight, CheckCircle2, Search, Building2, Plus } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

interface FoundCompany {
  name: string
  country?: string
  sector?: string
  website?: string
  logo_url?: string
  description?: string
  confidence: number
}

interface MessageAction {
  type: 'watch_created' | 'companies_found' | 'companies_added'
  watchId?: string
  watchName?: string
  sectors?: string[]
  countries?: string[]
  companiesCount?: number
  companies?: FoundCompany[]
  query?: string
  added?: string[]
  skipped?: string[]
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  action?: MessageAction
}

const suggestions = [
  'Quelles sont les opportunités prioritaires en Côte d\'Ivoire ?',
  'Fais-moi une analyse du marché fintech en Afrique de l\'Ouest',
  'Résume les derniers signaux collectés sur mes veilles',
  'Quels sont les signaux d\'alarme à surveiller cette semaine ?',
  'Compare les acteurs du secteur télécoms au Sénégal',
]

// Formate le texte Markdown basique en JSX lisible
function formatMessage(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('**') && line.endsWith('**')) {
      return <p key={i} className="font-semibold mb-1">{line.slice(2, -2)}</p>
    }
    if (line.startsWith('• ') || line.startsWith('- ')) {
      return <p key={i} className="pl-2 before:content-['•'] before:mr-2 before:text-blue-400 mb-0.5">{line.slice(2)}</p>
    }
    if (line.startsWith('# ')) {
      return <p key={i} className="font-bold text-base mb-1 mt-2">{line.slice(2)}</p>
    }
    if (line.startsWith('## ')) {
      return <p key={i} className="font-semibold mb-1 mt-1.5">{line.slice(3)}</p>
    }
    if (line === '') return <br key={i} />
    // Détecter les URLs dans le texte
    const urlRegex = /(https?:\/\/[^\s]+)/g
    if (urlRegex.test(line)) {
      const parts = line.split(urlRegex)
      return (
        <p key={i} className="mb-0.5">
          {parts.map((part, j) =>
            /^https?:\/\//.test(part)
              ? <a key={j} href={part} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 underline underline-offset-2 inline-flex items-center gap-0.5">
                  {new URL(part).hostname}<ExternalLink size={10} className="inline" />
                </a>
              : part
          )}
        </p>
      )
    }
    return <p key={i} className="mb-0.5">{line}</p>
  })
}

const WELCOME: Message = {
  role: 'assistant',
  content: 'Bonjour ! Je suis votre assistant MarketLens. Je peux vous aider à analyser vos données de veille, comprendre vos concurrents, ou explorer de nouvelles opportunités de marché. Que souhaitez-vous explorer ?'
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  // Charger l'historique depuis la DB au montage
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function loadHistory() {
      try {
        const res = await fetch('/api/chat?limit=60')
        if (!res.ok) return
        const data = await res.json()
        const history: Message[] = (data.messages || []).map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
        if (history.length > 0) {
          setMessages(history)
        }
      } catch {
        // Silencieux — on garde le message d'accueil par défaut
      } finally {
        setHistoryLoading(false)
      }
    }

    loadHistory()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setError('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // On envoie le message en string — l'historique est géré côté serveur (DB)
        body: JSON.stringify({ message: msg }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        const errMsg = data.error || `Erreur ${res.status}`
        console.error('[Chat] API error:', errMsg)
        setError(errMsg)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ Erreur : ${errMsg}`
        }])
        return
      }

      if (!data.content) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Désolé, la réponse était vide. Veuillez reformuler votre question.'
        }])
        return
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content,
        action: data.action || undefined,
      }])
    } catch (e: any) {
      console.error('[Chat] Fetch error:', e)
      setError('Impossible de contacter le serveur')
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Impossible de contacter le serveur. Vérifiez votre connexion.'
      }])
    } finally {
      setLoading(false)
    }
  }

  async function clearHistory() {
    if (!confirm('Effacer tout l\'historique de conversation ?')) return
    try {
      await fetch('/api/chat', { method: 'DELETE' })
      setMessages([{
        role: 'assistant',
        content: 'Historique effacé. Bonjour ! Comment puis-je vous aider ?'
      }])
    } catch { /* silencieux */ }
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-8rem)] lg:h-[calc(100vh-7rem)] flex flex-col pb-16 lg:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center">
          <Bot size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-neutral-900">Assistant IA MarketLens</h2>
          <div className="text-xs text-green-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            En ligne · Contextualisé sur vos veilles
          </div>
        </div>
        <button
          onClick={clearHistory}
          title="Effacer l'historique"
          className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-red-50 hover:text-red-500 flex items-center justify-center text-neutral-400 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Bannière erreur */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 text-xs text-red-700 flex-shrink-0">
          <AlertCircle size={13} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">

        {/* Chargement initial de l'historique */}
        {historyLoading && (
          <div className="flex items-center justify-center py-8 gap-2 text-neutral-400">
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <span className="text-xs">Chargement de l&apos;historique...</span>
          </div>
        )}

        {!historyLoading && messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
                <Sparkles size={12} className="text-white" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
              ${msg.role === 'user'
                ? 'bg-blue-700 text-white rounded-br-sm'
                : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-sm shadow-sm'
              }`}>
              {msg.role === 'assistant'
                ? <div className="space-y-0">{formatMessage(msg.content)}</div>
                : msg.content
              }
            </div>

            {/* Carte action "Veille créée" */}
            {msg.action?.type === 'watch_created' && (
              <div className="mt-2 ml-8 bg-green-50 border border-green-200 rounded-xl p-3 max-w-[85%]">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={14} className="text-green-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-green-800">Veille créée avec succès</span>
                </div>
                <div className="text-xs text-green-700 font-medium mb-1">
                  {msg.action.watchName}
                </div>
                {(msg.action.sectors?.length || msg.action.countries?.length) && (
                  <div className="text-[11px] text-green-600 mb-2">
                    {msg.action.sectors?.join(', ')}
                    {msg.action.sectors?.length && msg.action.countries?.length ? ' · ' : ''}
                    {msg.action.countries?.join(', ')}
                    {msg.action.companiesCount ? ` · ${msg.action.companiesCount} entreprise${msg.action.companiesCount > 1 ? 's' : ''}` : ''}
                  </div>
                )}
                <div className="flex gap-2">
                  <Link
                    href="/veilles"
                    className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    <Eye size={11} /> Mes veilles
                  </Link>
                  <Link
                    href={`/veilles/${msg.action.watchId}/edit`}
                    className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    Modifier <ArrowRight size={11} />
                  </Link>
                </div>
              </div>
            )}

            {/* Carte action "Entreprises trouvées" */}
            {msg.action?.type === 'companies_found' && msg.action.companies && msg.action.companies.length > 0 && (
              <div className="mt-2 ml-8 bg-blue-50 border border-blue-200 rounded-xl p-3 max-w-[90%]">
                <div className="flex items-center gap-2 mb-2">
                  <Search size={14} className="text-blue-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-blue-800">
                    {msg.action.companies.length} entreprise{msg.action.companies.length > 1 ? 's' : ''} trouvée{msg.action.companies.length > 1 ? 's' : ''}
                  </span>
                  {msg.action.query && (
                    <span className="text-[10px] text-blue-500 ml-auto">{msg.action.query}</span>
                  )}
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {msg.action.companies.slice(0, 10).map((co, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-blue-100">
                      {co.logo_url ? (
                        <img src={co.logo_url} alt="" className="w-6 h-6 rounded object-contain flex-shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Building2 size={12} className="text-blue-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-neutral-800 truncate">{co.name}</div>
                        <div className="text-[10px] text-neutral-500 truncate">
                          {[co.sector, co.country, co.website && new URL(co.website).hostname].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div className="text-[10px] font-medium text-blue-600 flex-shrink-0">
                        {co.confidence}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Carte action "Entreprises ajoutées" */}
            {msg.action?.type === 'companies_added' && (
              <div className="mt-2 ml-8 bg-green-50 border border-green-200 rounded-xl p-3 max-w-[85%]">
                <div className="flex items-center gap-2 mb-2">
                  <Plus size={14} className="text-green-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-green-800">
                    {msg.action.added?.length || 0} entreprise{(msg.action.added?.length || 0) > 1 ? 's' : ''} ajoutée{(msg.action.added?.length || 0) > 1 ? 's' : ''}
                  </span>
                </div>
                {msg.action.added && msg.action.added.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {msg.action.added.map((name, idx) => (
                      <span key={idx} className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
                {msg.action.skipped && msg.action.skipped.length > 0 && (
                  <div className="text-[10px] text-neutral-500">
                    Déjà présentes : {msg.action.skipped.join(', ')}
                  </div>
                )}
                {msg.action.watchId && (
                  <Link
                    href={`/veilles/${msg.action.watchId}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-100 hover:bg-green-200 px-2.5 py-1 rounded-lg transition-colors mt-2"
                  >
                    <Eye size={11} /> Voir la veille
                  </Link>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Indicateur de chargement réponse en cours */}
        {!historyLoading && loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center mr-2 flex-shrink-0 mt-1">
              <Sparkles size={12} className="text-white" />
            </div>
            <div className="bg-white border border-neutral-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Suggestions — affichées seulement si historique vide (1 seul message = l'accueil) */}
        {!historyLoading && messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-2 mt-2">
            {suggestions.map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full hover:bg-blue-100 transition-colors text-left">
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <input
          className="input flex-1"
          placeholder="Posez votre question sur vos données de veille..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={loading}
        />
        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
          className="btn-primary px-3 py-2 flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50">
          <Send size={14} />
          <span className="hidden sm:inline">Envoyer</span>
        </button>
      </div>
    </div>
  )
}
