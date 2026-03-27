import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGeminiChat } from '@/lib/ai/gemini'

// Nombre maximum de tours conservés en mémoire (1 tour = 1 message user + 1 model)
const MAX_HISTORY_TURNS = 15

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { message, watchId } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: 'Message vide' }, { status: 400 })

    // ── Contexte utilisateur ────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id, full_name')
      .eq('id', user.id)
      .single()

    // Veilles actives (avec id pour la query signals)
    const { data: watches } = await supabase
      .from('watches')
      .select('id, name, sectors, countries')
      .eq('account_id', profile?.account_id)

    // Signaux récents — on essaie d'abord avec source_name (migration 003),
    // sinon on retombe sur les colonnes de base (robustesse si migration non appliquée)
    const watchIds = (watches || []).map((w: any) => w.id).filter(Boolean)
    let recentSignals: any[] = []
    if (watchIds.length > 0) {
      const { data: s1, error: e1 } = await supabase
        .from('signals')
        .select('title, raw_content, url, source_name, companies(name)')
        .in('watch_id', watchIds)
        .order('collected_at', { ascending: false })
        .limit(15)
      if (!e1) {
        recentSignals = s1 || []
      } else {
        // Fallback sans source_name (si colonne absente)
        console.warn('[Chat] source_name absent, fallback sans cette colonne:', e1.message)
        const { data: s2 } = await supabase
          .from('signals')
          .select('title, raw_content, url, companies(name)')
          .in('watch_id', watchIds)
          .order('collected_at', { ascending: false })
          .limit(15)
        recentSignals = s2 || []
      }
    }

    // Rapports récents pour contexte enrichi
    let recentReports: any[] = []
    if (watchIds.length > 0) {
      const { data: r } = await supabase
        .from('reports')
        .select('title, summary, type')
        .in('watch_id', watchIds)
        .order('generated_at', { ascending: false })
        .limit(5)
      recentReports = r || []
    }

    // ── Mémoire : historique chargé depuis la base de données ──────────────
    // La persistance est côté serveur — indépendante du navigateur/client
    let dbHistory: any[] = []
    if (profile?.account_id) {
      const { data: h, error: he } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('account_id', profile.account_id)
        .order('created_at', { ascending: true })
        .limit(MAX_HISTORY_TURNS * 2)
      if (he) console.warn('[Chat] Impossible de charger l\'historique:', he.message)
      else dbHistory = h || []
    }

    // Convertit les messages DB au format Gemini multi-tour
    // (role 'assistant' en DB → 'model' pour Gemini)
    const history = dbHistory.map((msg: any) => ({
      role:    msg.role === 'assistant' ? 'model' : 'user',
      content: msg.content,
    })) as { role: 'user' | 'model'; content: string }[]

    // ── Contexte injecté dans le system prompt (pas dans l'historique) ─────
    const watchContext = (watches || []).length > 0
      ? (watches || []).map((w: any) =>
          `• ${w.name} (${w.sectors?.join(', ')} · ${w.countries?.join(', ')})`
        ).join('\n')
      : 'Aucune veille configurée'

    const signalContext = recentSignals.length > 0
      ? recentSignals.map((s: any) => {
          const company = s.companies?.name
          const source  = s.source_name || (s.url ? (() => { try { return new URL(s.url).hostname } catch { return '' } })() : '')
          return `• [${company || '?'}] ${s.title || s.raw_content?.slice(0, 100)}${source ? ` — via ${source}` : ''}${s.url ? ` (${s.url})` : ''}`
        }).join('\n')
      : 'Aucun signal récent'

    const reportContext = recentReports.length > 0
      ? recentReports.map((r: any) =>
          `• [${r.type}] ${r.title} : ${r.summary?.slice(0, 150)}`
        ).join('\n')
      : ''

    const systemPrompt = `Tu es l'assistant IA de MarketLens, plateforme de veille concurrentielle pour les marchés africains.
Tu aides ${profile?.full_name || 'l\'utilisateur'} à analyser ses données de veille, comprendre ses marchés et prendre des décisions stratégiques.

VEILLES ACTIVES :
${watchContext}

DERNIERS SIGNAUX COLLECTÉS (avec sources) :
${signalContext}

${reportContext ? `RAPPORTS RÉCENTS :\n${reportContext}\n` : ''}
RÈGLES :
- Réponds toujours en français
- Sois factuel : cite les données de veille ci-dessus quand pertinent, avec la source si disponible
- Si tu cites une URL de signal, mentionne-la comme référence vérifiable
- Si tu manques de données, dis-le et propose de lancer un agent de collecte
- Ton style est professionnel mais accessible, direct et actionnable
- Termine les réponses importantes par 1-2 recommandations concrètes`

    // ── Appel Gemini en mode multi-tour natif ──────────────────────────────
    const { text: reply, tokensUsed } = await callGeminiChat(
      systemPrompt,
      history,
      message.trim(),
      { maxOutputTokens: 1200, temperature: 0.5 }
    )

    const replyText = reply.trim() || "Désolé, je n'ai pas pu générer une réponse."

    // ── Sauvegarde en base (persistance de la mémoire) ─────────────────────
    if (profile?.account_id) {
      await supabase.from('chat_messages').insert([
        {
          account_id: profile.account_id,
          user_id:    user.id,
          role:       'user',
          content:    message.trim(),
        },
        {
          account_id:  profile.account_id,
          user_id:     user.id,
          role:        'assistant',
          content:     replyText,
          tokens_used: tokensUsed,
        },
      ])
    }

    return NextResponse.json({ content: replyText, tokensUsed })
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error('[Chat] Erreur:', msg)
    // En dev on expose le message, en prod on le logue seulement
    const isDev = process.env.NODE_ENV !== 'production'
    return NextResponse.json(
      { error: isDev ? msg : 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// ── Endpoint GET : récupère l'historique complet ────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('id', user.id).single()

    const url    = new URL(req.url)
    const limit  = parseInt(url.searchParams.get('limit') || '50')

    const { data: messages } = await supabase
      .from('chat_messages')
      .select('id, role, content, created_at, tokens_used')
      .eq('account_id', profile?.account_id)
      .order('created_at', { ascending: true })
      .limit(limit)

    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// ── Endpoint DELETE : efface l'historique (réinitialise la mémoire) ─────────
export async function DELETE() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('id', user.id).single()

    await supabase
      .from('chat_messages')
      .delete()
      .eq('account_id', profile?.account_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
