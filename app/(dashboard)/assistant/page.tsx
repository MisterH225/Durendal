'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Sparkles, Trash2, AlertCircle, ExternalLink } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string }

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

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant MarketLens. Je peux vous aider à analyser vos données de veille, comprendre vos concurrents, ou explorer de nouvelles opportunités de marché. Que souhaitez-vous explorer ?'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

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
          content: `⚠️ ${errMsg.includes('GEMINI') || errMsg.includes('API')
            ? 'La clé Gemini n\'est pas configurée sur le serveur. Contactez l\'administrateur.'
            : errMsg.includes('autorisé')
              ? 'Vous devez être connecté pour utiliser l\'assistant.'
              : 'Une erreur est survenue. Réessayez dans quelques secondes.'
          }`
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

      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
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
        {messages.map((msg, i) => (
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
          </div>
        ))}

        {/* Indicateur de chargement */}
        {loading && (
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

        {/* Suggestions (affichées seulement au début) */}
        {messages.length === 1 && !loading && (
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
