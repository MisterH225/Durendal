import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: 'MarketLens — Veille concurrentielle Afrique',
  description: 'La plateforme de veille concurrentielle et d\'analyse de marché pour les entreprises africaines.',
  keywords: 'veille concurrentielle, analyse marché, Afrique, Côte d\'Ivoire, fintech, intelligence économique',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

const themeInitScript = `(function(){try{var t=localStorage.getItem('marketlens-theme');if(t==='light')document.documentElement.classList.remove('dark');else document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
