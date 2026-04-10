import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = createAdminClient()

  // Test 1: requête simple sans join
  const test1 = await db
    .from('forecast_signal_feed')
    .select('id, signal_type, title, severity, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  // Test 2: avec joins !left
  const test2 = await db
    .from('forecast_signal_feed')
    .select('id, signal_type, title, severity, data, created_at, forecast_questions!left(id, slug, title, blended_probability), forecast_channels!left(id, slug, name, name_fr, name_en)')
    .order('created_at', { ascending: false })
    .limit(5)

  // Test 3: joins sans !left
  const test3 = await db
    .from('forecast_signal_feed')
    .select('id, signal_type, title, forecast_questions(id, title), forecast_channels(id, name)')
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({
    test1_simple: { data: test1.data, error: test1.error?.message ?? null, count: test1.data?.length ?? 0 },
    test2_left_join: { data: test2.data, error: test2.error?.message ?? null, count: test2.data?.length ?? 0 },
    test3_default_join: { data: test3.data, error: test3.error?.message ?? null, count: test3.data?.length ?? 0 },
    env_check: {
      has_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      url_prefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) + '...',
    },
  })
}
