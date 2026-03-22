import { createClient } from '@/lib/supabase/server'
import { Plus, Globe, FileText, Database } from 'lucide-react'

export default async function AdminSourcesPage() {
  const supabase = createClient()
  const { data: sources } = await supabase
    .from('sources')
    .select('*')
    .order('reliability_score', { ascending: false })

  const webSources = sources?.filter(s => s.type === 'web') || []
  const docSources = sources?.filter(s => s.type === 'document') || []
  const dataSources = sources?.filter(s => s.type === 'data') || []

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Bibliothèque de sources</h2>
          <p className="text-xs text-neutral-500 mt-1">{sources?.length || 0} sources configurées</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={13} /> Source web
          </button>
          <button className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={13} /> Document
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Sources web', count: webSources.length, active: webSources.filter(s => s.is_active).length, icon: Globe, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Documents', count: docSources.length, active: docSources.filter(s => s.is_active).length, icon: FileText, color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: 'Données structurées', count: dataSources.length, active: dataSources.filter(s => s.is_active).length, icon: Database, color: 'text-green-700', bg: 'bg-green-50' },
        ].map(({ label, count, active, icon: Icon, color, bg }) => (
          <div key={label} className="card">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={16} className={color} />
            </div>
            <div className="text-xl font-bold text-neutral-900">{count}</div>
            <div className="text-xs text-neutral-500">{label}</div>
            <div className="text-[11px] text-green-600 mt-0.5">{active} actives</div>
          </div>
        ))}
      </div>

      {/* Web sources table */}
      <div className="card-lg mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Globe size={15} className="text-blue-700" />
          <h3 className="text-sm font-bold text-neutral-900">Sources web</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {['Nom', 'Pays', 'Secteurs', 'Méthode', 'Fiabilité', 'Accès', 'Statut', ''].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-neutral-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {webSources.map((source: any) => (
                <tr key={source.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-neutral-900">{source.name}</div>
                    {source.url && <div className="text-neutral-400 truncate max-w-[140px]">{source.url}</div>}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-0.5">
                      {source.countries?.slice(0,3).map((c: string) => (
                        <span key={c} className="badge badge-gray text-[9px]">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-0.5 max-w-[100px]">
                      {source.sectors?.slice(0,2).map((s: string) => (
                        <span key={s} className="badge badge-blue text-[9px]">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-neutral-600 uppercase">{source.scraping_method || 'rss'}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`w-2 h-2 rounded-sm ${i <= (source.reliability_score || 3) ? 'bg-amber-500' : 'bg-neutral-200'}`} />
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-0.5">
                      {source.plans_access?.map((p: string) => (
                        <span key={p} className={`badge text-[9px] ${p === 'free' ? 'badge-gray' : p === 'pro' ? 'badge-blue' : 'badge-purple'}`}>{p}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`badge ${source.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {source.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <button className="text-[10px] px-2 py-1 bg-neutral-100 text-neutral-600 rounded hover:bg-neutral-200 transition-colors">
                      Modifier
                    </button>
                  </td>
                </tr>
              ))}
              {webSources.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-neutral-400">Aucune source web.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Documents section */}
      <div className="card-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-purple-700" />
            <h3 className="text-sm font-bold text-neutral-900">Sources documentaires</h3>
          </div>
          <button className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={12} /> Uploader un document
          </button>
        </div>

        {docSources.length > 0 ? (
          <div className="space-y-2">
            {docSources.map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-purple-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-neutral-900">{doc.name}</div>
                  <div className="text-[10px] text-neutral-400">{doc.file_type?.toUpperCase()} · {doc.countries?.join(', ')}</div>
                </div>
                <span className={`badge ${doc.is_active ? 'badge-green' : 'badge-gray'}`}>
                  {doc.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center">
            <FileText size={24} className="text-neutral-200 mb-2" />
            <p className="text-xs text-neutral-400 mb-3">Aucun document uploadé.</p>
            <p className="text-xs text-neutral-400">Uploadez des PDFs (rapports sectoriels, études de marché, données douanières UEMOA/CEDEAO)</p>
          </div>
        )}
      </div>
    </div>
  )
}
