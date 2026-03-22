import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { messages } = await req.json()

    // Récupère le contexte de veille de l'utilisateur
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

    // Contexte injecté dans le system prompt
    const watchContext = watches?.map((w: any) =>
      `- ${w.name} (${w.sectors?.join(', ')} · ${w.countries?.join(', ')})`
    ).join('\n') || 'Aucune veille configurée'

    const signalContext = recentSignals?.map((s: any) =>
      `- [${s.companies?.name}] ${s.title || s.raw_content?.slice(0, 100)}`
    ).join('\n') || 'Aucun signal récent'

    const systemPrompt = `Tu es l'assistant IA de MarketLens, une plateforme de veille concurrentielle pour les marchés africains (Côte d'Ivoire, Sénégal, Ghana et autres pays africains).

Tu aides les utilisateurs à analyser leurs données de veille concurrentielle, comprendre leurs marchés, et prendre des décisions stratégiques.

VEILLES ACTIVES DE L'UTILISATEUR :
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

    // Appel Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      throw new Error('Erreur API Claude')
    }

    const data = await response.json()
    const content = data.content[0]?.text || 'Désolé, je n\'ai pas pu générer une réponse.'

    // Sauvegarde en base
    if (profile?.account_id) {
      await supabase.from('chat_messages').insert([
        { account_id: profile.account_id, user_id: user.id, role: 'user', content: messages[messages.length-1].content },
        { account_id: profile.account_id, user_id: user.id, role: 'assistant', content, tokens_used: data.usage?.output_tokens || 0 },
      ])
    }

    return NextResponse.json({ content })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
