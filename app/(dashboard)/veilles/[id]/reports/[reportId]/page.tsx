import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileText, Lightbulb, TrendingUp, AlertTriangle, ListChecks, Link2 } from 'lucide-react'

type ReportContent = {
  title?: string
  executive_summary?: string
  key_insights?: Array<{
    company?: string
    insight?: string
    importance?: string
    type?: string
    sources?: Array<{ i?: number; url?: string; title?: string }>
    source_refs?: number[]
  }>
  trends?: string[]
  alerts?: string[]
  recommendations?: string[]
  period?: string
  signals_analyzed?: number
  sources_index?: Array<{ i: number; url?: string; title?: string }>
  generated_at?: string
}

function fmtDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function WatchReportPage({
  params,
}: {
  params: { id: string; reportId: string }
}) {
  const supabase = createClient()

  const { data: watch } = await supabase
    .from('watches')
    .select('id, name')
    .eq('id', params.id)
    .single()

  if (!watch) notFound()

  const { data: report, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', params.reportId)
    .eq('watch_id', params.id)
    .maybeSingle()

  if (error || !report) notFound()

  const c = (report.content ?? {}) as ReportContent
  const summary = report.summary ?? c.executive_summary ?? ''
  const title = report.title ?? c.title ?? 'Rapport de veille'
  const generated =
    fmtDate(report.generated_at) ?? fmtDate(c.generated_at) ?? null

  return (
    <div className="max-w-3xl mx-auto pb-20 lg:pb-0">
      <Link
        href={`/veilles/${params.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-600 mb-4 transition-colors"
      >
        <ArrowLeft size={12} /> Retour à la veille
      </Link>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0">
          <FileText size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-neutral-900 leading-snug">{title}</h1>
          <p className="text-xs text-neutral-500 mt-1">{watch.name}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {generated && <span className="text-[11px] text-neutral-400">{generated}</span>}
            <span
              className={`badge text-[10px] ${
                report.type === 'synthesis' || report.type === 'analyse'
                  ? 'badge-blue'
                  : report.type === 'market'
                    ? 'badge-green'
                    : 'badge-purple'
              }`}
            >
              Agent {report.agent_used ?? 2}
            </span>
            {c.period && (
              <span className="text-[11px] text-neutral-500">{c.period}</span>
            )}
          </div>
        </div>
      </div>

      {summary && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-2">Synthèse exécutive</h2>
          <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
        </section>
      )}

      {c.key_insights && c.key_insights.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-3 flex items-center gap-2">
            <Lightbulb size={16} className="text-amber-600" />
            Insights clés
          </h2>
          <ul className="space-y-3">
            {c.key_insights.map((ins, idx) => (
              <li
                key={idx}
                className="p-3 rounded-lg bg-neutral-50 border border-neutral-100 text-sm text-neutral-800"
              >
                {ins.company && (
                  <div className="text-xs font-semibold text-blue-800 mb-1">{ins.company}</div>
                )}
                <p className="leading-relaxed">{ins.insight}</p>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {ins.importance && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">
                      {ins.importance}
                    </span>
                  )}
                  {ins.type && (
                    <span className="text-[10px] text-neutral-500">{ins.type}</span>
                  )}
                </div>
                {ins.sources && ins.sources.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-neutral-200 pt-2">
                    {ins.sources.map((s, j) =>
                      s?.url ? (
                        <li key={j}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            <Link2 size={10} />
                            [{s.i ?? j + 1}] {s.title ?? s.url}
                          </a>
                        </li>
                      ) : null,
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.trends && c.trends.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-2 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-600" />
            Tendances
          </h2>
          <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
            {c.trends.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {c.alerts && c.alerts.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-2 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            Alertes
          </h2>
          <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
            {c.alerts.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </section>
      )}

      {c.recommendations && c.recommendations.length > 0 && (
        <section className="card-lg mb-4">
          <h2 className="text-sm font-bold text-neutral-900 mb-2 flex items-center gap-2">
            <ListChecks size={16} className="text-blue-600" />
            Recommandations
          </h2>
          <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
            {c.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {c.sources_index && c.sources_index.length > 0 && (
        <section className="card-lg">
          <h2 className="text-sm font-bold text-neutral-900 mb-2">Sources</h2>
          <ol className="space-y-2 text-sm">
            {c.sources_index.map((s) => (
              <li key={s.i} className="flex gap-2">
                <span className="text-neutral-400 w-6 flex-shrink-0">[{s.i}]</span>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {s.title ?? s.url}
                  </a>
                ) : (
                  <span>{s.title}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {typeof c.signals_analyzed === 'number' && (
        <p className="text-[11px] text-neutral-400 mt-4">
          {c.signals_analyzed} signal{c.signals_analyzed > 1 ? 'ux' : ''} analysé
          {c.signals_analyzed > 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
