/**
 * Génération de messages commerciaux courts.
 * Formats : email, WhatsApp, LinkedIn.
 *
 * Utilise Gemini pour une personnalisation contextuelle.
 * Fallback vers des templates statiques si l'IA n'est pas disponible.
 */

import { callGemini } from '@/lib/ai/gemini'

export type MessageFormat = 'email' | 'whatsapp' | 'linkedin'

export interface MessageInput {
  companyName: string
  contactName?: string
  contactTitle?: string
  signalSummary: string
  signalType: string
  approachAngle: string
  userCompanyName?: string
  userFullName?: string
  sector?: string
  format: MessageFormat
}

export interface GeneratedMessage {
  subject?: string
  body: string
  format: MessageFormat
}

const FORMAT_INSTRUCTIONS: Record<MessageFormat, string> = {
  email: `Format EMAIL professionnel. Inclus un objet (subject) et un corps (body).
Le corps doit faire 4-6 phrases max. Ton professionnel, direct, sans jargon marketing.`,
  whatsapp: `Format WHATSAPP court. Pas d'objet. 3-4 phrases max.
Ton conversationnel mais professionnel. Pas d'émojis excessifs (1-2 max).`,
  linkedin: `Format MESSAGE LINKEDIN. Pas d'objet. 3-5 phrases max.
Ton professionnel, personnel. Mentionner un point de connexion.`,
}

export async function generateMessage(input: MessageInput): Promise<GeneratedMessage> {
  const prompt = `Tu es un expert en développement commercial B2B. Génère un message de prospection.

CONTEXTE :
- Entreprise cible : ${input.companyName}
${input.contactName ? `- Contact : ${input.contactName}${input.contactTitle ? ` (${input.contactTitle})` : ''}` : '- Contact : Décideur non identifié'}
- Signal détecté : ${input.signalSummary}
- Type de signal : ${input.signalType}
- Angle d'approche : ${input.approachAngle}
- Secteur : ${input.sector || 'non précisé'}
${input.userCompanyName ? `- Mon entreprise : ${input.userCompanyName}` : ''}
${input.userFullName ? `- Mon nom : ${input.userFullName}` : ''}

${FORMAT_INSTRUCTIONS[input.format]}

RÈGLES :
- Cite le signal détecté naturellement sans être intrusif
- Propose une valeur claire et concrète
- Évite le ton spam ou surpromesse
- Reste sobre et respectueux
- Termine par un appel à l'action simple (échange, appel rapide)
- Réponds en français

Réponds UNIQUEMENT au format JSON :
${input.format === 'email' ? '{ "subject": "...", "body": "..." }' : '{ "body": "..." }'}`

  try {
    const { text } = await callGemini(prompt, { maxOutputTokens: 500, temperature: 0.7 })
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      subject: parsed.subject,
      body: parsed.body || parsed.message || text,
      format: input.format,
    }
  } catch {
    return generateFallbackMessage(input)
  }
}

function generateFallbackMessage(input: MessageInput): GeneratedMessage {
  const greeting = input.contactName ? `Bonjour ${input.contactName}` : 'Bonjour'
  const signal = input.signalSummary || 'une activité récente'
  const company = input.companyName
  const me = input.userFullName || 'notre équipe'

  if (input.format === 'email') {
    return {
      subject: `${company} — ${input.approachAngle}`,
      body: `${greeting},\n\nNous avons noté ${signal} concernant ${company}. ${input.approachAngle}.\n\nSeriez-vous disponible pour un échange de 15 minutes cette semaine ?\n\nCordialement,\n${me}`,
      format: 'email',
    }
  }

  if (input.format === 'whatsapp') {
    return {
      body: `${greeting}, nous avons noté ${signal} concernant ${company}. ${input.approachAngle}. Seriez-vous disponible pour un échange rapide ? ${me}`,
      format: 'whatsapp',
    }
  }

  return {
    body: `${greeting}, j'ai remarqué ${signal} concernant ${company}. ${input.approachAngle}. Je serais ravi d'échanger sur les synergies possibles. Bonne journée, ${me}`,
    format: 'linkedin',
  }
}
