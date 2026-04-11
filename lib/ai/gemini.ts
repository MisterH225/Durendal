const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export type GeminiModel =
  | 'gemini-2.5-flash'          // Stable — MODÈLE PAR DÉFAUT (meilleur rapport qualité/prix 2025-2026)
  | 'gemini-2.5-flash-lite'     // Ultra-rapide et économique
  | 'gemini-3-flash-preview'    // Preview Gemini 3 (instable — tests uniquement)
  | 'gemini-3.1-pro-preview'    // Preview Gemini 3.1 Pro (tests uniquement)
  | 'gemini-1.5-flash'          // Ancien modèle stable — fallback

export interface GroundingSource {
  title: string
  url: string
}

/**
 * Appel générique à l'API Google Gemini.
 * Utilise gemini-2.5-flash par défaut : modèle stable recommandé 2026.
 */
export async function callGemini(
  prompt: string,
  options: {
    model?: GeminiModel
    maxOutputTokens?: number
    temperature?: number
  } = {}
): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant dans les variables d\'environnement')

  const model           = options.model           ?? 'gemini-2.5-flash'
  const maxOutputTokens = options.maxOutputTokens ?? 2000
  const temperature     = options.temperature     ?? 0.3

  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens, temperature },
      }),
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini API ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const text      = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const tokensUsed = data.usageMetadata?.candidatesTokenCount ?? 0

  return { text, tokensUsed }
}

/**
 * Appel Gemini avec Google Search Grounding activé.
 *
 * Gemini effectue une vraie recherche Google en temps réel, ancre ses
 * réponses sur les résultats trouvés et retourne les URLs sources
 * (groundingChunks). Equivalent à l'approche Perplexity :
 * chaque information est liée à une source vérifiable.
 *
 * - Inclus dans le quota Gemini (1 500 req/jour gratuit, ~$0.035/1K après)
 * - 1 seul appel par requête → beaucoup plus rapide que scraping + extraction
 * - temperature forcée à 0.1 pour maximiser la factualité
 */
export async function callGeminiWithSearch(
  prompt: string,
  options: {
    model?: GeminiModel
    maxOutputTokens?: number
    systemInstruction?: string
  } = {}
): Promise<{ text: string; sources: GroundingSource[]; tokensUsed: number }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant')

  const model           = options.model           ?? 'gemini-2.5-flash'
  const maxOutputTokens = options.maxOutputTokens ?? 3000

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: { maxOutputTokens, temperature: 0.1 },
  }
  if (options.systemInstruction) {
    body.system_instruction = { parts: [{ text: options.systemInstruction }] }
  }

  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini+Search API ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const candidate  = data.candidates?.[0]
  const text       = candidate?.content?.parts?.[0]?.text ?? ''
  const tokensUsed = data.usageMetadata?.candidatesTokenCount ?? 0

  // Extrait les URLs sources depuis les groundingChunks
  const groundingChunks: any[] = candidate?.groundingMetadata?.groundingChunks ?? []
  const sources: GroundingSource[] = groundingChunks
    .map((chunk: any) => ({
      title: chunk.web?.title ?? '',
      url:   chunk.web?.uri   ?? '',
    }))
    .filter(s => s.url.length > 0)
    // Déduplique par URL
    .filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i)

  return { text, sources, tokensUsed }
}

export interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

export interface GeminiFunctionCall {
  name: string
  args: Record<string, any>
}

export interface GeminiChatResult {
  text: string
  tokensUsed: number
  functionCall?: GeminiFunctionCall
}

/**
 * Appel Gemini en mode conversation multi-tour avec support du function calling.
 *
 * Si Gemini décide d'appeler un outil, `functionCall` est retourné dans le résultat.
 * L'appelant doit exécuter la fonction et appeler `callGeminiChatWithFunctionResult`
 * pour obtenir la réponse textuelle finale.
 */
export async function callGeminiChat(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  options: {
    model?: GeminiModel
    maxOutputTokens?: number
    temperature?: number
    tools?: object[]
  } = {}
): Promise<GeminiChatResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant')

  const model           = options.model           ?? 'gemini-2.5-flash'
  const maxOutputTokens = options.maxOutputTokens ?? 1200
  const temperature     = options.temperature     ?? 0.5

  const contents = [
    ...history.map(msg => ({
      role:  msg.role,
      parts: [{ text: msg.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  const body: any = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens, temperature },
  }
  if (options.tools?.length) body.tools = options.tools

  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini Chat API ${res.status}: ${errText}`)
  }

  const data       = await res.json()
  const candidate  = data.candidates?.[0]
  const tokensUsed = data.usageMetadata?.candidatesTokenCount ?? 0
  const parts      = candidate?.content?.parts ?? []

  // Détecter un function call dans la réponse
  const fcPart = parts.find((p: any) => p.functionCall)
  if (fcPart) {
    return {
      text: '',
      tokensUsed,
      functionCall: {
        name: fcPart.functionCall.name,
        args: fcPart.functionCall.args ?? {},
      },
    }
  }

  const text = parts.find((p: any) => p.text)?.text ?? ''
  return { text, tokensUsed }
}

/**
 * Second appel après exécution d'une fonction — fournit le résultat à Gemini
 * pour qu'il génère la réponse textuelle finale.
 */
export async function callGeminiChatWithFunctionResult(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  functionCall: GeminiFunctionCall,
  functionResult: Record<string, any>,
  options: {
    model?: GeminiModel
    maxOutputTokens?: number
    temperature?: number
    tools?: object[]
  } = {}
): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant')

  const model           = options.model           ?? 'gemini-2.5-flash'
  const maxOutputTokens = options.maxOutputTokens ?? 1200
  const temperature     = options.temperature     ?? 0.5

  // L'historique inclut : messages précédents + message utilisateur + appel fonction + résultat
  const contents = [
    ...history.map(msg => ({
      role:  msg.role,
      parts: [{ text: msg.content }],
    })),
    { role: 'user',  parts: [{ text: userMessage }] },
    { role: 'model', parts: [{ functionCall: { name: functionCall.name, args: functionCall.args } }] },
    { role: 'user',  parts: [{ functionResponse: { name: functionCall.name, response: functionResult } }] },
  ]

  const body: any = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens, temperature },
  }
  if (options.tools?.length) body.tools = options.tools

  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini Chat API (function result) ${res.status}: ${errText}`)
  }

  const data     = await res.json()
  const text     = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const tokensUsed = data.usageMetadata?.candidatesTokenCount ?? 0
  return { text, tokensUsed }
}

/**
 * Extrait un objet JSON depuis la réponse texte de Gemini.
 * Gère : blocs ```json … ```, JSON tronqué (maxOutputTokens atteint),
 * virgules trailing, et réponses multi-blocs.
 */
export function parseGeminiJson<T>(text: string): T | null {
  if (!text || text.trim().length === 0) return null

  // 1. Nettoyage markdown
  let cleaned = text
    .replace(/```(?:json)?\s*\n?/g, '')
    .trim()

  // 2. Extraire le bloc JSON principal (premier { … dernier })
  //    Gère le cas où Gemini inclut du "raisonnement" avant le JSON
  const firstBrace = cleaned.indexOf('{')
  if (firstBrace === -1) return null
  const fromBrace = cleaned.slice(firstBrace)
  const match = fromBrace.match(/\{[\s\S]*\}/)
  if (!match) return null
  let json = match[0]

  // 3. Tentative directe
  try { return JSON.parse(json) as T } catch {}

  // 4. Réparation JSON tronqué (token limit atteint)
  json = json
    .replace(/,\s*$/, '')                   // virgule trailing en fin de fichier
    .replace(/,\s*([}\]])/g, '$1')          // virgules avant fermeture
    .replace(/"[^"]*$/g, '"')               // fermer une string ouverte
    .replace(/:\s*"[^"]*$/g, ': ""')        // valeur string ouverte → vide

  // Compter les accolades/crochets manquants et les fermer
  let braces = 0, brackets = 0, inString = false, escape = false
  for (const ch of json) {
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') braces++
    else if (ch === '}') braces--
    else if (ch === '[') brackets++
    else if (ch === ']') brackets--
  }
  json = json.replace(/,\s*$/, '')
  while (brackets > 0) { json += ']'; brackets-- }
  while (braces > 0)   { json += '}'; braces-- }

  try { return JSON.parse(json) as T } catch {}

  // 5. Dernière tentative : extraire les objets individuels d'un tableau signals
  try {
    const arrMatch = json.match(/\[\s*(\{[\s\S]*)\s*\]/)
    if (arrMatch) {
      const inner = arrMatch[1]
      const objects: any[] = []
      const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g
      let m
      while ((m = objRegex.exec(inner)) !== null) {
        try { objects.push(JSON.parse(m[0])) } catch {}
      }
      if (objects.length > 0) return { signals: objects } as unknown as T
    }
  } catch {}

  return null
}
