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
  } = {}
): Promise<{ text: string; sources: GroundingSource[]; tokensUsed: number }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant')

  const model           = options.model           ?? 'gemini-2.5-flash'
  const maxOutputTokens = options.maxOutputTokens ?? 3000

  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens, temperature: 0.1 },
      }),
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

/**
 * Appel Gemini en mode conversation multi-tour (proper multi-turn).
 *
 * Utilise le format natif Gemini :
 *   systemInstruction (séparé du contexte conversationnel)
 *   contents = [{role:"user",...}, {role:"model",...}, ...]
 *
 * Contrairement à callGemini() qui concatène tout dans un seul string,
 * cette fonction exploite le vrai mécanisme de session Gemini.
 * L'historique doit être fourni par l'appelant (stocké côté serveur/DB).
 */
export async function callGeminiChat(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string,
  options: {
    model?: GeminiModel
    maxOutputTokens?: number
    temperature?: number
  } = {}
): Promise<{ text: string; tokensUsed: number }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY manquant')

  const model           = options.model           ?? 'gemini-2.5-flash'
  const maxOutputTokens = options.maxOutputTokens ?? 1200
  const temperature     = options.temperature     ?? 0.5

  // Format natif Gemini : historique + nouveau message utilisateur
  const contents = [
    ...history.map(msg => ({
      role:  msg.role,
      parts: [{ text: msg.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  const res = await fetch(
    `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens, temperature },
      }),
    }
  )

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Gemini Chat API ${res.status}: ${errText}`)
  }

  const data     = await res.json()
  const text     = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const tokensUsed = data.usageMetadata?.candidatesTokenCount ?? 0

  return { text, tokensUsed }
}

/**
 * Extrait un objet JSON depuis la réponse texte de Gemini.
 * Gemini peut encadrer le JSON dans des blocs ```json ... ```.
 */
export function parseGeminiJson<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}
