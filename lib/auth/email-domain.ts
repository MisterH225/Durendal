/** Domaines Google considérés comme « Gmail » (pas d’OTP à l’inscription). */
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

export function isGmailAddress(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  const domain = email.slice(at + 1).trim().toLowerCase()
  return GMAIL_DOMAINS.has(domain)
}

export const OTP_SIGNUP_STORAGE_KEY = 'marketlens_otp_signup'
