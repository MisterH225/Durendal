import { VeilleSubNav } from '@/components/veille/VeilleSubNav'
import { getLocale } from '@/lib/i18n/server'
import { headers } from 'next/headers'

export default function VeilleLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale()
  const headersList = headers()
  const pathname = headersList.get('x-next-pathname') ?? ''
  const isOnboarding = pathname.includes('/onboarding')

  return (
    <div>
      {!isOnboarding && <VeilleSubNav locale={locale} />}
      {children}
    </div>
  )
}
