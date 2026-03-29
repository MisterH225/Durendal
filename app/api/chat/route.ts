import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callGeminiChat, callGeminiChatWithFunctionResult } from '@/lib/ai/gemini'
import { findCompaniesByName, findCompaniesByCriteria } from '@/lib/agents/company-finder'

// ── Déclarations des outils disponibles pour l'assistant ────────────────────
const CHAT_TOOLS = [
  {
    function_declarations: [
      {
        name: 'create_watch',
        description: 'Crée une nouvelle veille concurrentielle pour surveiller des entreprises dans un secteur et pays donnés. Utilise cet outil quand l\'utilisateur demande explicitement de créer, ajouter ou mettre en place une veille.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nom court et descriptif de la veille (ex: "Fintech Côte d\'Ivoire")',
            },
            description: {
              type: 'string',
              description: 'Description optionnelle de l\'objectif de la veille',
            },
            sectors: {
              type: 'array',
              items: { type: 'string' },
              description: 'Secteurs à surveiller parmi : Fintech, E-commerce, Télécom, Logistique, BTP / Immobilier, Santé, EdTech, Énergie, Agriculture, Autre',
            },
            countries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Codes pays ISO 3166-1 alpha-2 (ex : FR, US, CI, SN, GH, NG, DE, BR, JP, CN…). L\'utilisateur peut choisir n\'importe quel pays du monde.',
            },
            companies: {
              type: 'array',
              description: 'Entreprises à surveiller (optionnel)',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  country: { type: 'string', description: 'Code pays ISO' },
                  sector: { type: 'string' },
                },
                required: ['name'],
              },
            },
          },
          required: ['name', 'sectors', 'countries'],
        },
      },
      {
        name: 'search_companies',
        description: 'Recherche des entreprises correspondant à des critères donnés (nom, secteur, pays, type d\'activité). Utilise cet outil quand l\'utilisateur demande de trouver, identifier ou chercher des entreprises pour les ajouter à une veille. Retourne une liste d\'entreprises avec leurs informations. IMPORTANT : après avoir trouvé des entreprises, présente-les à l\'utilisateur et demande confirmation avant de les ajouter.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Critères de recherche en langage naturel (ex: "sous-traitants miniers en Côte d\'Ivoire", "fintechs au Sénégal", "entreprises de BTP à Abidjan")',
            },
            sector: {
              type: 'string',
              description: 'Secteur d\'activité pour filtrer (optionnel)',
            },
            country: {
              type: 'string',
              description: 'Pays ou région pour filtrer (optionnel)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'add_companies_to_watch',
        description: 'Ajoute des entreprises à une veille existante. Utilise cet outil UNIQUEMENT après avoir présenté les entreprises à l\'utilisateur via search_companies ET obtenu sa confirmation. Ne jamais ajouter sans confirmation explicite.',
        parameters: {
          type: 'object',
          properties: {
            watch_id: {
              type: 'string',
              description: 'ID de la veille à laquelle ajouter les entreprises',
            },
            companies: {
              type: 'array',
              description: 'Liste des entreprises à ajouter',
              items: {
                type: 'object',
                properties: {
                  name:    { type: 'string', description: 'Nom de l\'entreprise' },
                  country: { type: 'string', description: 'Code pays ISO (optionnel)' },
                  sector:  { type: 'string', description: 'Secteur d\'activité (optionnel)' },
                  website: { type: 'string', description: 'Site web (optionnel)' },
                },
                required: ['name'],
              },
            },
          },
          required: ['watch_id', 'companies'],
        },
      },
      {
        name: 'list_watches',
        description: 'Liste les veilles actives de l\'utilisateur avec leurs ID, noms, secteurs, pays et entreprises suivies. Utilise cet outil quand tu as besoin de connaître les veilles existantes pour y ajouter des entreprises, ou quand l\'utilisateur demande quelles veilles il a.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ],
  },
]

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

    // Veilles actives (avec id + entreprises liées)
    const { data: watches } = await supabase
      .from('watches')
      .select('id, name, sectors, countries, watch_companies(company_id, companies(name))')
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
    // Gemini exige : alternance user/model, commence toujours par user
    const rawHistory = dbHistory.map((msg: any) => ({
      role:    msg.role === 'assistant' ? 'model' : 'user',
      content: msg.content,
    })) as { role: 'user' | 'model'; content: string }[]

    // Supprimer les messages initiaux model pour que ça commence par user
    let startIdx = 0
    while (startIdx < rawHistory.length && rawHistory[startIdx].role === 'model') startIdx++
    const history = rawHistory.slice(startIdx)

    // ── Contexte injecté dans le system prompt (pas dans l'historique) ─────
    const watchContext = (watches || []).length > 0
      ? (watches || []).map((w: any) => {
          const companyNames = (w.watch_companies || [])
            .map((wc: any) => wc.companies?.name).filter(Boolean)
          const companyStr = companyNames.length > 0
            ? ` — Entreprises suivies : ${companyNames.join(', ')}`
            : ' — Aucune entreprise ajoutée'
          return `• [ID: ${w.id}] ${w.name} (${w.sectors?.join(', ')} · ${w.countries?.join(', ')})${companyStr}`
        }).join('\n')
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

    const systemPrompt = `Tu es l'assistant IA de MarketLens, plateforme de veille concurrentielle internationale.
Tu aides ${profile?.full_name || 'l\'utilisateur'} à analyser ses données de veille, comprendre ses marchés et prendre des décisions stratégiques.

VEILLES ACTIVES (avec IDs pour les actions) :
${watchContext}

DERNIERS SIGNAUX COLLECTÉS (avec sources) :
${signalContext}

${reportContext ? `RAPPORTS RÉCENTS :\n${reportContext}\n` : ''}
CAPACITÉS :
- Tu peux CRÉER une nouvelle veille (create_watch)
- Tu peux RECHERCHER des entreprises par nom, secteur, pays, critères (search_companies)
- Tu peux AJOUTER des entreprises à une veille existante (add_companies_to_watch)
- Tu peux LISTER les veilles de l'utilisateur (list_watches)

PROTOCOLE D'AJOUT D'ENTREPRISES :
1. Quand l'utilisateur demande d'ajouter des entreprises à une veille :
   a. Si la veille n'est pas clairement identifiable, utilise list_watches pour trouver la bonne
   b. Utilise search_companies pour identifier les entreprises correspondant aux critères
   c. Présente les résultats à l'utilisateur de manière claire (nom, pays, secteur, description)
   d. Demande confirmation avant d'ajouter
   e. Une fois confirmé, utilise add_companies_to_watch avec le watch_id et les entreprises choisies
2. Si l'utilisateur donne directement des noms, recherche-les quand même pour vérifier/enrichir les infos
3. Si un nom d'entreprise est ambigu (homonymes), présente les options avec logos/secteurs pour désambiguïser

RÈGLES :
- Réponds toujours en français
- Sois factuel : cite les données de veille ci-dessus quand pertinent, avec la source si disponible
- Si tu cites une URL de signal, mentionne-la comme référence vérifiable
- Si tu manques de données, dis-le et propose de lancer un agent de collecte
- Ton style est professionnel mais accessible, direct et actionnable
- Termine les réponses importantes par 1-2 recommandations concrètes`

    // ── Appel Gemini en mode multi-tour natif avec function calling ─────────
    const geminiResult = await callGeminiChat(
      systemPrompt,
      history,
      message.trim(),
      { maxOutputTokens: 1500, temperature: 0.5, tools: CHAT_TOOLS }
    )

    let replyText   = ''
    let tokensUsed  = geminiResult.tokensUsed
    let actionData: any = null

    if (geminiResult.functionCall) {
      // ── Gemini veut exécuter une fonction ──────────────────────────────
      const fc = geminiResult.functionCall
      let functionResult: Record<string, any> = {}

      if (fc.name === 'create_watch') {
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/watches`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: (await import('next/headers')).cookies().toString(),
            },
            body: JSON.stringify(fc.args),
          })
          const data = await res.json()
          if (res.ok && data.watch) {
            functionResult = {
              success: true,
              watchId: data.watch.id,
              watchName: data.watch.name,
              message: `Veille "${data.watch.name}" créée avec succès.`,
            }
            actionData = {
              type: 'watch_created',
              watchId: data.watch.id,
              watchName: data.watch.name,
              sectors: fc.args.sectors,
              countries: fc.args.countries,
              companiesCount: (fc.args.companies || []).length,
            }
          } else {
            functionResult = { success: false, error: data.error || 'Erreur création veille' }
          }
        } catch (e: any) {
          functionResult = { success: false, error: e.message }
        }
      }

      else if (fc.name === 'search_companies') {
        try {
          console.log('[Chat] search_companies:', fc.args)
          const result = fc.args.query
            ? await findCompaniesByCriteria(fc.args.query, fc.args.sector, fc.args.country)
            : { companies: [], source: 'combined' as const, query: '' }

          functionResult = {
            success: true,
            companies: result.companies.map((c) => ({
              name:        c.name,
              country:     c.country || null,
              sector:      c.sector || null,
              website:     c.website || null,
              logo_url:    c.logo_url || null,
              description: c.description || null,
              confidence:  c.confidence,
            })),
            count: result.companies.length,
            source: result.source,
            message: result.companies.length > 0
              ? `${result.companies.length} entreprise(s) trouvée(s). Présente-les à l'utilisateur et demande confirmation avant de les ajouter.`
              : 'Aucune entreprise trouvée. Demande à l\'utilisateur de préciser ses critères.',
          }
          actionData = {
            type: 'companies_found',
            companies: result.companies.slice(0, 15),
            query: fc.args.query,
          }
        } catch (e: any) {
          console.error('[Chat] search_companies error:', e)
          functionResult = { success: false, error: e.message }
        }
      }

      else if (fc.name === 'add_companies_to_watch') {
        try {
          console.log('[Chat] add_companies_to_watch:', fc.args)
          const { watch_id, companies: companiesArg } = fc.args

          if (!watch_id || !companiesArg?.length) {
            functionResult = { success: false, error: 'watch_id et companies sont requis' }
          } else {
            const admin = createAdminClient()
            const added: string[] = []
            const skipped: string[] = []
            const errors: string[] = []

            for (const co of companiesArg) {
              const name = co.name?.trim()
              if (!name) continue

              try {
                const { data: existing } = await admin
                  .from('companies')
                  .select('id')
                  .ilike('name', name)
                  .limit(1)

                let companyId = existing?.[0]?.id
                if (!companyId) {
                  const targetWatch = (watches || []).find((w: any) => w.id === watch_id)
                  const { data: newCo, error: coErr } = await admin
                    .from('companies')
                    .insert({
                      name,
                      country:  co.country || targetWatch?.countries?.[0] || null,
                      sector:   co.sector || null,
                      website:  co.website || null,
                      logo_url: co.logo_url || null,
                    })
                    .select('id')
                    .single()
                  if (coErr) { errors.push(`${name}: ${coErr.message}`); continue }
                  companyId = newCo?.id
                }

                if (companyId) {
                  const { data: existingLink } = await admin
                    .from('watch_companies')
                    .select('id')
                    .eq('watch_id', watch_id)
                    .eq('company_id', companyId)
                    .limit(1)

                  if (existingLink?.length) { skipped.push(name); continue }

                  const { error: wcErr } = await admin
                    .from('watch_companies')
                    .insert({ watch_id, company_id: companyId, aspects: co.aspects ?? [] })
                  if (wcErr) { errors.push(`${name}: ${wcErr.message}`); continue }
                  added.push(name)
                }
              } catch (e: any) {
                errors.push(`${name}: ${e.message}`)
              }
            }

            const targetWatch = (watches || []).find((w: any) => w.id === watch_id)
            functionResult = {
              success: true,
              added,
              skipped,
              errors: errors.length > 0 ? errors : undefined,
              watch_name: targetWatch?.name || watch_id,
              message: added.length > 0
                ? `${added.length} entreprise(s) ajoutée(s) à "${targetWatch?.name}": ${added.join(', ')}${skipped.length > 0 ? `. ${skipped.length} déjà présente(s): ${skipped.join(', ')}` : ''}`
                : `Aucune entreprise ajoutée.${skipped.length > 0 ? ` ${skipped.length} déjà présente(s).` : ''}`,
            }
            actionData = {
              type: 'companies_added',
              watchId: watch_id,
              watchName: targetWatch?.name,
              added,
              skipped,
            }
          }
        } catch (e: any) {
          console.error('[Chat] add_companies_to_watch error:', e)
          functionResult = { success: false, error: e.message }
        }
      }

      else if (fc.name === 'list_watches') {
        const watchList = (watches || []).map((w: any) => {
          const companyNames = (w.watch_companies || [])
            .map((wc: any) => wc.companies?.name).filter(Boolean)
          return {
            id:        w.id,
            name:      w.name,
            sectors:   w.sectors,
            countries: w.countries,
            companies: companyNames,
          }
        })
        functionResult = {
          success: true,
          watches: watchList,
          count: watchList.length,
        }
      }

      // Second appel pour que Gemini formule la réponse après l'action
      const followUp = await callGeminiChatWithFunctionResult(
        systemPrompt,
        history,
        message.trim(),
        fc,
        functionResult,
        { maxOutputTokens: 1500, temperature: 0.5, tools: CHAT_TOOLS }
      )
      replyText  = followUp.text.trim()
      tokensUsed += followUp.tokensUsed
    } else {
      replyText = geminiResult.text.trim()
    }

    if (!replyText) replyText = "Désolé, je n'ai pas pu générer une réponse."

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

    return NextResponse.json({ content: replyText, tokensUsed, action: actionData })
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error('[Chat] Erreur:', msg)
    // On expose toujours le message pour faciliter le debug
    return NextResponse.json({ error: msg }, { status: 500 })
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
