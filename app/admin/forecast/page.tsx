import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Plus, CheckCircle, Clock, XCircle, TrendingUp, Radio, Zap, Pause } from 'lucide-react'
import { ForecastQuestionsEventsPanel, type ForecastAdminQuestionRow } from './ForecastQuestionsEventsPanel'

export const dynamic = 'force-dynamic'

type Search = { status?: string; source?: string }

export default async function ForecastAdminPage({ searchParams }: { searchParams: Search }) {
  const db = createAdminClient()
  const statusFilter = searchParams?.status ?? 'all'
  const sourceFilter = searchParams?.source ?? 'all'

  let questionsQuery = db
    .from('forecast_questions')
    .select('id, slug, title, status, close_date, featured, tags, created_by, forecast_count, crowd_probability, ai_probability, blended_probability, created_at, forecast_channels ( id, slug, name ), forecast_events ( id, slug, title )')
    .order('created_at', { ascending: false })
    .limit(200)

  if (statusFilter !== 'all') questionsQuery = questionsQuery.eq('status', statusFilter)
  if (sourceFilter === 'ia') questionsQuery = questionsQuery.is('created_by', null)
  if (sourceFilter === 'admin') questionsQuery = questionsQuery.not('created_by', 'is', null)

  const [
    { data: questions, error: questionsError },
    { data: channels, error: channelsError },
    { data: events, error: eventsError },
    { data: recentSignals, error: signalsError },
  ] = await Promise.all([
    questionsQuery,
    db.from('forecast_channels').select('id, slug, name').eq('is_active', true).order('sort_order'),
    db.from('forecast_events').select('id, slug, title, channel_id, status').order('created_at', { ascending: false }).limit(200),
    db.from('forecast_signal_feed').select('id, signal_type, title, severity, created_at').order('created_at', { ascending: false }).limit(5),
  ])

  const qList = questions ?? []
  const stats = {
    total: qList.length,
    open: qList.filter(q => q.status === 'open').length,
    paused: qList.filter(q => q.status === 'paused').length,
    closed: qList.filter(q => q.status === 'closed').length,
    draft: qList.filter(q => q.status === 'draft').length,
  }
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const signalCount = recentSignals?.length ?? 0
  const SIGNAL_TYPE_META: Record<string, { label: string; color: string }> = {
    news:              { label: 'Actualité', color: 'bg-violet-100 text-violet-700' },
    probability_shift: { label: 'Glissement', color: 'bg-blue-100 text-blue-700' },
    resolution:        { label: 'Résolu', color: 'bg-green-100 text-green-700' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2"><TrendingUp size={18} className="text-blue-600" />Forecast Éditorial</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Questions manuelles ou générées automatiquement (worker <strong>forecast:question-generator</strong>, toutes les 6 h). Les brouillons IA ont <code className="text-[11px] bg-neutral-100 px-1 rounded">created_by</code> vide — publiez ou éditez ici.
          </p>
        </div>
        <Link href="/admin/forecast/questions/new" className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium"><Plus size={14} />Nouvelle question</Link>
      </div>

      {!hasServiceRole && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 space-y-1">
          <p className="font-semibold">Clé service Supabase absente (Next.js)</p>
          <p>
            Sans <code className="bg-amber-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>, ce serveur utilise la clé anon : le RLS peut masquer les brouillons, les pauses et d’autres lignes — les compteurs et listes peuvent rester vides alors que des données existent.
          </p>
        </div>
      )}

      {(questionsError || eventsError || channelsError || signalsError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900 space-y-1">
          <p className="font-semibold">Erreur lecture Supabase</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {questionsError && <li>Questions : {questionsError.message}</li>}
            {eventsError && <li>Événements : {eventsError.message}</li>}
            {channelsError && <li>Canaux : {channelsError.message}</li>}
            {signalsError && <li>Signaux : {signalsError.message}</li>}
          </ul>
        </div>
      )}

      {(qList.length === 0 && !questionsError && hasServiceRole && (channels?.length ?? 0) === 0) && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950 space-y-1">
          <p className="font-semibold">Aucun canal actif en base</p>
          <p>
            Appliquez la migration forecast (016) sur Supabase ou insérez des lignes dans <code className="bg-blue-100 px-1 rounded">forecast_channels</code>. Sans canaux, le générateur de questions s’arrête tout de suite.
          </p>
        </div>
      )}

      {(qList.length === 0 && !questionsError && hasServiceRole && (channels?.length ?? 0) > 0) && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-800 space-y-1">
          <p className="font-semibold">Base vide mais canaux présents</p>
          <p>
            Vérifiez que le processus <strong>forecast-worker</strong> tourne (PM2) avec <code className="bg-neutral-200 px-1 rounded">GEMINI_API_KEY</code> et la clé service, ou déclenchez une fois le cron HTTP{' '}
            <code className="bg-neutral-200 px-1 rounded">GET /api/cron/forecast-questions?secret=…</code> (même secret que <code className="bg-neutral-200 px-1 rounded">CRON_SECRET</code> si défini).
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
              <Radio size={15} className="text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Signaux d'actualité</h3>
              <p className="text-xs text-neutral-500">
                Générés automatiquement par le worker — 1er run au démarrage, puis toutes les 2h.
              </p>
            </div>
          </div>
          <Link href="/forecast/signals" target="_blank"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium">
            Voir le feed →
          </Link>
        </div>

        {signalCount === 0 ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
              <Zap size={12} /> Aucun signal dans la base
            </p>
            <p className="text-xs text-amber-700">
              Le worker génère les signaux automatiquement au démarrage.
              Sur Hostinger : <code className="bg-amber-100 px-1 rounded">git pull &amp;&amp; npm run build &amp;&amp; pm2 restart ecosystem.config.js</code>
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Derniers signaux ({signalCount} affichés)
            </p>
            {recentSignals?.map(s => {
              const meta = SIGNAL_TYPE_META[s.signal_type] ?? { label: s.signal_type, color: 'bg-neutral-100 text-neutral-600' }
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs text-neutral-700 py-1.5 border-b border-neutral-50 last:border-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${meta.color} flex-shrink-0`}>{meta.label}</span>
                  <span className="flex-1 truncate">{s.title}</span>
                  <span className="text-neutral-400 flex-shrink-0">
                    {new Date(s.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[{ label: 'Total', value: stats.total, icon: TrendingUp, color: 'text-neutral-600' }, { label: 'Ouvertes', value: stats.open, icon: CheckCircle, color: 'text-green-600' }, { label: 'En pause', value: stats.paused, icon: Pause, color: 'text-orange-600' }, { label: 'Fermées', value: stats.closed, icon: Clock, color: 'text-amber-600' }, { label: 'Brouillons', value: stats.draft, icon: XCircle, color: 'text-neutral-400' }].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3">
            <Icon size={20} className={color} />
            <div><div className="text-2xl font-bold text-neutral-900">{value}</div><div className="text-xs text-neutral-500">{label}</div></div>
          </div>
        ))}
      </div>

      <ForecastQuestionsEventsPanel
        questions={qList as ForecastAdminQuestionRow[]}
        events={events ?? []}
        channels={channels ?? []}
        statusFilter={statusFilter}
        sourceFilter={sourceFilter}
      />
    </div>
  )
}
