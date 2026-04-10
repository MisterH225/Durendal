import { redirect } from 'next/navigation'

// www.durendal.pro → landing publique Forecast
export default function RootPage() {
  redirect('/forecast')
}
