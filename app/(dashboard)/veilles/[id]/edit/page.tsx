import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function EditWatchRedirect({ params }: { params: { id: string } }) {
  redirect(`/forecast/veille/watches/${params.id}/edit`)
}
