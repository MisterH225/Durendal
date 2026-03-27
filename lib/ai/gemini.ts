const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export type GeminiModel =
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  | 'gemini-1.5-flash'
  | 'gemini-1.5-pro'

/**
 * Appel générique à l'API Google Gemini.
 * Utilise gemini-2.0-flash par défaut : rapide, très bon rapport qualité/prix.
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

  const model           = options.model           ?? 'gemini-2.0-flash'
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
 * Extrait un objet JSON depuis la réponse texte de Gemini.
 * Gemini peut encadrer le JSON dans des blocs ```json ... ```.
 */
export function parseGeminiJson<T>(text: string): T | null {
  try {
    // Retire les balises markdown si présentes
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}
