'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  MessageSquare, Send, Loader2, Sparkles, X, ChevronRight,
  AlertCircle, RotateCcw, Lightbulb, GripHorizontal,
} from 'lucide-react'

type Message = { role: 'user' | 'assistant'; content: string; mirofishUsed?: boolean }

const QUICK_PROMPTS = [
  'Quels sont les points faibles de ce rapport ?',
  'Sur quoi reposent ces prédictions ?',
  'Quelles entreprises sont les plus menaçantes ?',
  'Cite des exemples réels comparables',
  'Quels sont les angles morts de l\'analyse ?',
]

export default function ReportChat({
  reportId,
  watchId,
  reportTitle,
}: {
  reportId: string
  watchId: string
  reportTitle: string
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  /* ── Drag state (mobile/tablet only) ── */
  const panelRef   = useRef<HTMLDivElement>(null)
  const dragRef    = useRef<{ startY: number; startTop: number; dragging: boolean }>({ startY: 0, startTop: 0, dragging: false })
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (window.innerWidth >= 1024) return
    const panel = panelRef.current
    if (!panel) return
    dragRef.current = { startY: e.clientY, startTop: panel.getBoundingClientRect().top, dragging: true }
    panel.style.transition = 'none'
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return
    const newY = Math.max(40, Math.min(window.innerHeight - 200, dragRef.current.startTop + (e.clientY - dragRef.current.startY)))
    setPos({ x: 0, y: newY })
  }, [])

  const onPointerUp = useCallback(() => {
    dragRef.current.dragging = false
    const panel = panelRef.current
    if (panel) panel.style.transition = ''
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/chat/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId,
          watchId,
          messages: updated.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur serveur')

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        mirofishUsed: data.mirofish_used,
      }])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, reportId, watchId])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function resetChat() {
    setMessages([])
    setError('')
  }

  /* ── Toggle button (collapsed) ── */
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex items-center gap-2 bg-blue-700 text-white px-4 py-3 rounded-xl shadow-lg hover:bg-blue-800 transition-all hover:scale-105 lg:static lg:right-auto lg:bottom-auto lg:w-12 lg:h-full lg:rounded-none lg:rounded-l-xl lg:flex-col lg:justify-center lg:px-2 lg:py-0 lg:shadow-none lg:border-l lg:border-neutral-200 lg:bg-neutral-50 lg:text-neutral-600 lg:hover:bg-neutral-100 lg:hover:text-blue-700"
        title="Ouvrir le chat IA"
      >
        <MessageSquare size={18} />
        <span className="text-xs font-medium lg:hidden">Chat IA</span>
        <span className="hidden lg:block text-[10px] font-medium [writing-mode:vertical-lr] rotate-180">Assistant IA</span>
      </button>
    )
  }

  /* ── Chat panel (open) ── */
  const mobileStyle: React.CSSProperties = pos && typeof window !== 'undefined' && window.innerWidth < 1024
    ? { position: 'fixed', top: pos.y, left: 0, right: 0, bottom: 0, transition: dragRef.current.dragging ? 'none' : 'top 0.2s ease' }
    : {}

  return (
    <div
      ref={panelRef}
      style={mobileStyle}
      className="fixed inset-x-0 bottom-0 top-[30vh] z-50 lg:static lg:z-auto lg:inset-auto flex flex-col bg-white lg:border-l lg:border-neutral-200 lg:w-[380px] lg:min-w-[340px] lg:max-h-[calc(100vh-80px)] lg:sticky lg:top-[64px] lg:flex-shrink-0 rounded-t-2xl lg:rounded-none shadow-2xl lg:shadow-none"
    >
      {/* Drag handle (mobile) */}
      <div
        className="flex items-center justify-center py-1.5 cursor-grab active:cursor-grabbing lg:hidden touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="w-10 h-1 rounded-full bg-neutral-300" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 bg-gradient-to-r from-blue-50 to-indigo-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center">
            <MessageSquare size={14} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-neutral-900">Assistant IA</h3>
            <p className="text-[10px] text-neutral-500 truncate max-w-[200px]">{reportTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={resetChat} className="w-7 h-7 rounded-lg hover:bg-white/60 flex items-center justify-center" title="Réinitialiser">
              <RotateCcw size={13} className="text-neutral-500" />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-white/60 flex items-center justify-center">
            <X size={14} className="text-neutral-500" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center text-center py-8">
            <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center mb-4">
              <Lightbulb size={24} className="text-blue-600" />
            </div>
            <h4 className="text-sm font-bold text-neutral-800 mb-1">Interrogez le rapport</h4>
            <p className="text-xs text-neutral-500 max-w-[260px] mb-5">
              Challengez les prédictions, demandez des explications ou explorez les analyses en profondeur.
            </p>
            <div className="space-y-2 w-full">
              {QUICK_PROMPTS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors flex items-center gap-2"
                >
                  <ChevronRight size={12} className="text-neutral-300 flex-shrink-0" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-700 text-white rounded-br-md'
                : 'bg-neutral-100 text-neutral-800 rounded-bl-md'
            }`}>
              {msg.role === 'assistant' && msg.mirofishUsed && (
                <div className="flex items-center gap-1 mb-1.5">
                  <Sparkles size={10} className="text-amber-500" />
                  <span className="text-[9px] text-amber-600 font-medium">Enrichi par MiroFish</span>
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-neutral-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-blue-600" />
              <span className="text-xs text-neutral-500">Analyse en cours...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 px-4 py-3 bg-white flex-shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez une question sur le rapport..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-neutral-200 px-3 py-2.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 max-h-[120px] overflow-y-auto"
            style={{ minHeight: '40px' }}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="w-9 h-9 rounded-xl bg-blue-700 text-white flex items-center justify-center hover:bg-blue-800 disabled:opacity-40 disabled:hover:bg-blue-700 transition-colors flex-shrink-0"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <p className="text-[9px] text-neutral-400 mt-1.5 text-center">
          L'IA peut se tromper. Vérifiez les informations importantes.
        </p>
      </div>
    </div>
  )
}
