import type { ReactNode } from 'react'

interface Props {
  id: string
  icon: ReactNode
  title: string
  children: ReactNode
  accentColor?: string
}

export function ImplicationSection({ id, icon, title, children, accentColor = 'blue' }: Props) {
  const borderMap: Record<string, string> = {
    blue:   'border-l-blue-500/40',
    amber:  'border-l-amber-500/40',
    red:    'border-l-red-500/40',
    green:  'border-l-emerald-500/40',
    purple: 'border-l-purple-500/40',
    rose:   'border-l-rose-500/40',
    teal:   'border-l-teal-500/40',
  }

  return (
    <section id={id} className={`border-l-2 ${borderMap[accentColor] ?? borderMap.blue} pl-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span className="text-neutral-400">{icon}</span>
        <h3 className="text-xs font-bold text-neutral-200 uppercase tracking-wider">{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  )
}
