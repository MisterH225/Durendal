import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function NewWatchRedirect() {
  redirect('/forecast/veille/watches/new')
}
