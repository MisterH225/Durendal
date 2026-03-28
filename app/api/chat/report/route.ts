import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'
import { callGemini }         from '@/lib/ai/gemini'

type Message = { role: 'user' | 'assistant'; content: string }

const SYSTEM_PROMPT = `Tu es un analyste senior en intelligence économique et stratégique.
Tu as accès au contenu complet d'un rapport de veille concurrentielle. Tu dois :
1. Répondre aux questions de l'utilisateur sur le rapport, les prédictions et les analyses.
2. Challenger tes propres conclusions si l'utilisateur le demande, avec honnêteté intellectuelle.
3. Expliquer la logique et les arguments derrière chaque prédiction ou recommandation.
4. Citer des exemples FACTUELS et RÉELS de stratégies d'entreprise comparables quand c'est pertinent.
5. Distinguer clairement ce qui est un FAIT (basé sur des données) de ce qui est une INTERPRÉTATION.
6. Si tu ne peux pas justifier une prédiction avec des éléments solides, dis-le franchement.

RÈGLES STRICTES :
- Base tes réponses UNIQUEMENT sur le contenu du rapport fourni et sur des connaissances vérifiables.
- Pas de réponses vagues. Sois PRÉCIS, STRUCTURÉ et ARGUMENTÉ.
- Utilise des exemples réels d'entreprises et de stratégies connues pour illustrer tes propos.
- Quand l'utilisateur challenge une prédiction, présente les arguments POUR et CONTRE.
- Réponds TOUJOURS en français.`

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { reportId, messages, watchId } = await req.json() as {
    reportId: string
    watchId: string
    messages: Message[]
  }

  if (!reportId || !messages?.length) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }

  const db = createAdminClient()

  const { data: report } = await db
    .from('reports')
    .select('title, summary, content, type, agent_used, generated_at')
    .eq('id', reportId)
    .single()

  if (!report) return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 })

  const reportContext = buildReportContext(report)

  let mirofishInsight = ''
  try {
    mirofishInsight = await tryMiroFishChat(db, reportId, messages)
  } catch { /* MiroFish indisponible — on continue avec Gemini seul */ }

  const conversationHistory = messages.map(m =>
    `${m.role === 'user' ? 'UTILISATEUR' : 'ASSISTANT'}: ${m.content}`
  ).join('\n\n')

  const prompt = `${SYSTEM_PROMPT}

═══ RAPPORT DE VEILLE ═══
${reportContext}
═══ FIN DU RAPPORT ═══

${mirofishInsight ? `═══ ANALYSE COMPLÉMENTAIRE MIROFISH ═══\n${mirofishInsight}\n═══ FIN MIROFISH ═══\n\n` : ''}═══ CONVERSATION ═══
${conversationHistory}

Réponds au dernier message de l'utilisateur de manière précise, structurée et argumentée.`

  try {
    const { text } = await callGemini(prompt, {
      maxOutputTokens: 4_000,
      temperature: 0.4,
    })

    return NextResponse.json({
      response: text,
      mirofish_used: !!mirofishInsight,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function buildReportContext(report: any): string {
  const c = report.content ?? {}
  const parts: string[] = []

  parts.push(`Titre: ${report.title ?? c.title ?? 'N/A'}`)
  parts.push(`Type: ${report.type ?? 'analyse'}`)
  parts.push(`Agent: ${report.agent_used ?? 2}`)
  if (report.generated_at) parts.push(`Date: ${report.generated_at}`)

  if (c.executive_summary || report.summary) {
    parts.push(`\n## Synthèse exécutive\n${c.executive_summary ?? report.summary}`)
  }

  if (c.company_analyses?.length) {
    parts.push('\n## Analyse par entreprise')
    for (const ca of c.company_analyses) {
      parts.push(`\n### ${ca.company ?? 'Entreprise'}`)
      if (ca.position_summary) parts.push(`Position: ${ca.position_summary}`)
      if (ca.key_moves?.length) parts.push(`Mouvements clés: ${ca.key_moves.join('; ')}`)
      if (ca.strengths?.length) parts.push(`Forces: ${ca.strengths.join('; ')}`)
      if (ca.weaknesses_or_risks?.length) parts.push(`Faiblesses/Risques: ${ca.weaknesses_or_risks.join('; ')}`)
      if (ca.momentum) parts.push(`Dynamique: ${ca.momentum}`)
    }
  }

  if (c.competitive_comparison) {
    parts.push('\n## Comparaison concurrentielle')
    const cc = c.competitive_comparison
    if (cc.overview) parts.push(cc.overview)
    if (cc.leader) parts.push(`Leader: ${cc.leader}`)
    if (cc.challenger) parts.push(`Challenger: ${cc.challenger}`)
    if (cc.differentiators?.length) {
      for (const d of cc.differentiators) parts.push(`- ${d.company}: ${d.advantage} → ${d.implication}`)
    }
    if (cc.gaps_to_watch?.length) parts.push(`Écarts à surveiller: ${cc.gaps_to_watch.join('; ')}`)
  }

  if (c.market_dynamics) {
    parts.push('\n## Dynamiques de marché')
    if (c.market_dynamics.trends?.length) parts.push(`Tendances: ${c.market_dynamics.trends.join('; ')}`)
    if (c.market_dynamics.emerging_opportunities?.length) parts.push(`Opportunités: ${c.market_dynamics.emerging_opportunities.join('; ')}`)
    if (c.market_dynamics.threats?.length) parts.push(`Menaces: ${c.market_dynamics.threats.join('; ')}`)
  }

  if (c.strategic_alerts?.length) {
    parts.push('\n## Alertes stratégiques')
    for (const a of c.strategic_alerts) parts.push(`- [${a.severity}] ${a.alert} (${a.company}) → ${a.recommended_action}`)
  }

  if (c.recommendations?.length) {
    parts.push('\n## Recommandations')
    for (const r of c.recommendations) parts.push(`- [${r.priority}] ${r.action} — ${r.rationale} (Horizon: ${r.time_horizon})`)
  }

  if (c.market_overview) {
    parts.push('\n## Vue d\'ensemble du marché')
    const mo = c.market_overview
    if (mo.market_size_estimate) parts.push(`Taille estimée: ${mo.market_size_estimate}`)
    if (mo.growth_assessment) parts.push(`Croissance: ${mo.growth_assessment}`)
    if (mo.maturity_stage) parts.push(`Maturité: ${mo.maturity_stage}`)
  }

  if (c.player_mapping?.length) {
    parts.push('\n## Cartographie des acteurs')
    for (const p of c.player_mapping) parts.push(`- ${p.company}: ${p.category} (${p.estimated_market_share}) — ${p.competitive_position}`)
  }

  if (c.swot_analyses?.length) {
    parts.push('\n## Analyses SWOT')
    for (const s of c.swot_analyses) {
      parts.push(`\n### SWOT ${s.company ?? ''}`)
      if (s.strengths?.length) parts.push(`Forces: ${s.strengths.join('; ')}`)
      if (s.weaknesses?.length) parts.push(`Faiblesses: ${s.weaknesses.join('; ')}`)
      if (s.opportunities?.length) parts.push(`Opportunités: ${s.opportunities.join('; ')}`)
      if (s.threats?.length) parts.push(`Menaces: ${s.threats.join('; ')}`)
    }
  }

  if (c.strategic_recommendations?.length) {
    parts.push('\n## Recommandations stratégiques')
    for (const r of c.strategic_recommendations) {
      parts.push(`- [${r.priority}] ${r.title}: ${r.description}`)
      if (r.kpis?.length) parts.push(`  KPIs: ${r.kpis.join('; ')}`)
    }
  }

  if (c.predictions_by_company?.length) {
    parts.push('\n## Prédictions par entreprise')
    for (const p of c.predictions_by_company) {
      parts.push(`\n### Prédictions ${p.company ?? ''}`)
      if (p.next_moves?.length) {
        for (const m of p.next_moves) parts.push(`- Mouvement anticipé: ${m.move} (Probabilité: ${m.probability}, Timing: ${m.timing}, Confiance: ${m.confidence})${m.supporting_signals?.length ? ` — Signaux: ${m.supporting_signals.join('; ')}` : ''}`)
      }
      if (p.strategic_intention) {
        const si = p.strategic_intention
        parts.push(`Intention stratégique: ${si.primary_objective} (${si.strategy_type})`)
        if (si.evidence?.length) parts.push(`Preuves: ${si.evidence.join('; ')}`)
      }
      if (p.counter_positioning?.length) {
        for (const cp of p.counter_positioning) parts.push(`- Contre-positionnement: ${cp.scenario} → ${cp.recommended_action} [${cp.priority}/${cp.urgency}]`)
      }
    }
  }

  if (c.market_predictions) {
    parts.push('\n## Prédictions de marché')
    const mp = c.market_predictions
    if (mp.consolidation_probability) parts.push(`Probabilité de consolidation: ${mp.consolidation_probability}`)
    if (mp.disruption_risks?.length) parts.push(`Risques de disruption: ${mp.disruption_risks.join('; ')}`)
    if (mp.key_inflection_points?.length) {
      for (const ip of mp.key_inflection_points) parts.push(`- Point d'inflexion: ${ip.event} (${ip.timing}, ${ip.probability}) — ${ip.implications}`)
    }
  }

  if (c.confidence_matrix) {
    parts.push('\n## Matrice de confiance')
    const cm = c.confidence_matrix
    parts.push(`Confiance globale: ${cm.overall_confidence}`)
    if (cm.key_assumptions?.length) parts.push(`Hypothèses clés: ${cm.key_assumptions.join('; ')}`)
    if (cm.blind_spots?.length) parts.push(`Angles morts: ${cm.blind_spots.join('; ')}`)
  }

  return parts.join('\n')
}

async function tryMiroFishChat(db: any, reportId: string, messages: Message[]): Promise<string> {
  const { data: agent } = await db
    .from('admin_agents')
    .select('config')
    .eq('id', 'prediction_engine')
    .single()

  const config = agent?.config
  if (!config?.mirofish_enabled || !config?.mirofish_url) return ''

  const base = (config.mirofish_url as string).replace(/\/$/, '')
  const apiKey = config.mirofish_api_key as string

  const hdrs: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) hdrs['Authorization'] = `Bearer ${apiKey}`

  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content ?? ''

  try {
    const res = await fetch(`${base}/api/report/chat`, {
      method: 'POST',
      headers: hdrs,
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        message: lastUserMsg,
        chat_history: messages.slice(0, -1).map(m => ({
          role: m.role, content: m.content,
        })),
      }),
    })
    if (!res.ok) return ''
    const body = await res.json()
    return body.data?.response ?? ''
  } catch {
    return ''
  }
}
