import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'

const BUCKET   = 'source-documents'
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB
const ALLOWED  = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // xlsx
  'application/msword',        // doc
  'application/vnd.ms-excel',  // xls
  'text/csv',
  'text/plain',
  'application/json',
])

function friendlyType(mime: string): string {
  if (mime.includes('pdf'))          return 'PDF'
  if (mime.includes('wordprocessing') || mime.includes('msword')) return 'Word'
  if (mime.includes('spreadsheet') || mime.includes('ms-excel')) return 'Excel'
  if (mime.includes('csv'))          return 'CSV'
  if (mime.includes('json'))         return 'JSON'
  if (mime.includes('text/plain'))   return 'TXT'
  return 'Document'
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })

  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `Type non supporté : ${file.type}. Formats acceptés : PDF, Word, Excel, CSV, TXT, JSON.` }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `Fichier trop volumineux (max ${MAX_SIZE / 1024 / 1024} MB)` }, { status: 400 })
  }

  const db = createAdminClient()

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadErr) return NextResponse.json({ error: `Upload échoué : ${uploadErr.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path)

  const { data: source, error: dbErr } = await db.from('sources').insert({
    name:              file.name,
    url:               urlData?.publicUrl ?? null,
    type:              'document',
    scraping_method:   'upload',
    file_path:         path,
    file_type:         ext,
    file_mime:         file.type,
    file_size:         file.size,
    file_display_type: friendlyType(file.type),
    is_active:         true,
    reliability_score: 4,
    plans_access:      ['free', 'pro', 'business'],
    countries:         [],
    sectors:           [],
  }).select().single()

  if (dbErr) {
    await db.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ source })
}
