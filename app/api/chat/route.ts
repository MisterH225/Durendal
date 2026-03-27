import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callGemini } from '@/lib/ai/gemini'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { messages } = await req.json()

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('id', user.id).single()

    const { data: watches } = await supabase
      .from('watches').select('name, sectors, countries').eq('account_id', profile?.account_id)

    const { data: recentSignals } = await supabase
      .from('signals')
      .select('title, raw_content, companies(name)')
      .in('watch_id', (watches || []).map((w: any) => w.id))
      .order('collected_at', { ascending: false })
      .limit(10)

    const watchContext = watches?.map((w: any) =>
      `- ${w.name} (${w.sectors?.join(', ')} · ${w.countries?.join(', ')})`
    ).join('\n') || 'Aucune veille configurée'

    const signalContext = recentSignals?.map((s: any) =>
      `- [${s.companies?.name}] ${s.title || s.raw_content?.slice(0, 100)}`
    ).join('\n') || 'Aucun signal récent'

    // Construit le prompt complet pour Gemini (system + historique + message utilisateur)
    const systemBlock = `Tu es l'assistant IA de MarketLens, une plateforme de veille concurrentielle pour les marchés africains (Côte d'Ivoire, Sénégal, Ghana et autres pays africains).
Tu aides les utilisateurs à analyser leurs données de veille, comprendre leurs marchés et prendre des décisions stratégiques.

VEILLES ACTIVES :
${watchContext}

DERNIERS SIGNAUX COLLECTÉS :
${signalContext}

INSTRUCTIONS :
- Réponds toujours en français
- Sois précis, concis et actionnable
- Cite les données de veille disponibles quand pertinent
- Si tu n'as pas assez de données, dis-le clairement et propose des pistes
- Adopte un ton professionnel mais accessible
- Termine tes réponses importantes par 1-2 actions concrètes recommandées`

    // Formate l'historique de conversation
    const historyBlock = (messages as any[]).slice(0, -1).map((m: any) =>
      `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${m.content}`
    ).join('\n\n')

    const lastMessage = messages[messages.length - 1]?.content || ''

    const fullPrompt = `${systemBlock}

${historyBlock ? `HISTORIQUE DE LA CONVERSATION :\n${historyBlock}\n\n` : ''}Utilisateur : ${lastMessage}

Assistant :`

    const { text: content, tokensUsed } = await callGemini(fullPrompt, {
      maxOutputTokens: 1000,
      temperature: 0.5,
    })

    const reply = content.trim() || 'Désolé, je n\'ai pas pu générer une réponse.'

    if (profile?.account_id) {
      await supabase.from('chat_messages').insert([
        { account_id: profile.account_id, user_id: user.id, role: 'user', content: lastMessage },
        { account_id: profile.account_id, user_id: user.id, role: 'assistant', content: reply, tokens_used: tokensUsed },
      ])
    }

    return NextResponse.json({ content: reply })
  } catch (error) {
    console.error('[Chat] Erreur:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
