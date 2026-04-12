import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ReportRedirect({ params }: { params: { id: string; reportId: string } }) {
  redirect(`/forecast/veille/watches/${params.id}/reports/${params.reportId}`)
}
