'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Sparkles } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string }

const suggestions = [
  'Résume les derniers mouvements de Wave Mobile Money',
  'Quelles sont les opportunités prioritaires en Côte d\'Ivoire ?',
  'Compare MTN MoMo et Orange Money sur les 3 derniers mois',
  'Analyse le marché fintech au Sénégal',
  'Quels sont les signaux d\'alarme à surveiller cette semaine ?',
]

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant MarketLens. Je peux vous aider à analyser vos données de veille, comprendre vos concurrents, ou explorer de nouvelles opportunités de marché. Que souhaitez-vous explorer ?'
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Désolé, une erreur est survenue. Veuillez réessayer.'
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto h-[calc(100vh-8rem)] lg:h-[calc(100vh-7rem)] flex flex-col pb-16 lg:pb-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center">
          <Bot size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-neutral-900">Assistant IA MarketLens</h2>
          <div className="text-xs text-green-600 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            En ligne · Contextalisé sur vos veilles
          </div>
        </div>
      </div>

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
              {msg.content}
            </div>
          </div>
        ))}

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
        {messages.length === 1 && (
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
