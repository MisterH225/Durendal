import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'MarketLens — Veille concurrentielle Afrique',
  description: 'La plateforme de veille concurrentielle et d\'analyse de marché pour les entreprises africaines.',
  keywords: 'veille concurrentielle, analyse marché, Afrique, Côte d\'Ivoire, fintech, intelligence économique',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
