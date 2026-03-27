'use client'
import { useState, useRef } from 'react'
import { Plus, Globe, FileText, Database, X, AlertCircle, Check, Upload, Loader2 } from 'lucide-react'

import { ALL_COUNTRIES } from '@/lib/countries'

const SECTORS = ['Fintech','E-commerce','Télécom','Logistique','BTP / Immobilier','Santé','EdTech','Énergie','Agriculture','Mines','Banque / Assurance','Transport','Autre']
const COUNTRIES = ALL_COUNTRIES.map(c => c.code)
const METHOD_LABELS: Record<string, string> = { rss: 'RSS', scraping: 'Scraping', api: 'API' }

function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
    return hostname.replace(/^www\./, '').replace(/\.[^.]+$/, '').replace(/\./g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  } catch {
    return url
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

type BulkRow = { url: string; name: string; valid: boolean; error?: string }

type Source = {
  id: string
  name: string
  url?: string
  type: string
  scraping_method?: string
  countries?: string[]
  sectors?: string[]
  reliability_score?: number
  plans_access?: string[]
  is_active: boolean
}

export default function SourcesClient({ initialSources }: { initialSources: Source[] }) {
  const [sources, setSources] = useState(initialSources)
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Bulk import state
  const [bulkText, setBulkText] = useState('')
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([])
  const [bulkCountries, setBulkCountries] = useState<string[]>([])
  const [bulkSectors, setBulkSectors] = useState<string[]>([])
  const [bulkMethod, setBulkMethod] = useState('scraping')
  const [bulkReliability, setBulkReliability] = useState(3)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [rssUrl, setRssUrl] = useState('')
  const [method, setMethod] = useState('rss')
  const [selectedCountries, setSelectedCountries] = useState<string[]>([])
  const [selectedSectors, setSelectedSectors] = useState<string[]>([])
  const [reliability, setReliability] = useState(3)

  const webSources = sources.filter(s => s.type === 'web')
  const docSources = sources.filter(s => s.type === 'document')
  const dataSources = sources.filter(s => s.type === 'data')

  function toggleMulti<T>(arr: T[], val: T) {
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  function resetForm() {
    setName(''); setUrl(''); setRssUrl(''); setMethod('rss')
    setSelectedCountries([]); setSelectedSectors([]); setReliability(3)
    setError(''); setSuccess('')
  }

  function resetBulk() {
    setBulkText(''); setBulkRows([]); setBulkCountries([]); setBulkSectors([])
    setBulkMethod('scraping'); setBulkReliability(3); setBulkResult(null); setError('')
  }

  function parseBulkText(text: string) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const rows: BulkRow[] = lines.map(line => {
      // Formats acceptés:
      // https://example.com
      // https://example.com | Nom personnalisé
      // example.com,Nom personnalisé  (CSV)
      const [rawUrl, customName] = line.includes('|')
        ? line.split('|').map(s => s.trim())
        : line.includes(',')
          ? line.split(',').map(s => s.trim())
          : [line, '']
      const url = normalizeUrl(rawUrl)
      try {
        new URL(url)
        return { url, name: customName || extractDomainName(url), valid: true }
      } catch {
        return { url: rawUrl, name: customName || rawUrl, valid: false, error: 'URL invalide' }
      }
    })
    setBulkRows(rows)
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = (ev.target?.result as string) || ''
      // Ignorer la ligne d'en-tête si elle commence par "url" ou "URL"
      const lines = text.split('\n')
      const data = lines[0]?.toLowerCase().startsWith('url') ? lines.slice(1) : lines
      setBulkText(data.join('\n'))
      parseBulkText(data.join('\n'))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function importBulk() {
    const validRows = bulkRows.filter(r => r.valid)
    if (validRows.length === 0) { setError('Aucune URL valide à importer'); return }
    setBulkImporting(true); setError('')
    let ok = 0; let failed = 0
    const added: Source[] = []
    for (const row of validRows) {
      try {
        const res = await fetch('/api/admin/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            url: row.url,
            type: 'web',
            scraping_method: bulkMethod,
            countries: bulkCountries,
            sectors: bulkSectors,
            reliability_score: bulkReliability,
            is_active: true,
            plans_access: ['free', 'pro', 'business'],
          }),
        })
        if (!res.ok) throw new Error()
        const { source } = await res.json()
        if (source) added.push(source)
        ok++
      } catch {
        failed++
      }
    }
    setSources(prev => [...added, ...prev])
    setBulkResult({ ok, failed })
    setBulkImporting(false)
    if (failed === 0) setTimeout(() => { setShowBulk(false); resetBulk() }, 2000)
  }

  async function toggleActive(source: Source) {
    setToggling(source.id)
    try {
      const res = await fetch(`/api/admin/sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !source.is_active }),
      })
      if (!res.ok) throw new Error(await res.text())
      setSources(prev => prev.map(s => s.id === source.id ? { ...s, is_active: !s.is_active } : s))
    } catch {
      setError('Erreur lors du changement de statut')
    } finally {
      setToggling(null)
    }
  }

  async function addSource() {
    if (!name.trim() || !url.trim()) { setError('Nom et URL sont obligatoires'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          rss_url: rssUrl.trim() || null,
          type: 'web',
          scraping_method: method,
          countries: selectedCountries,
          sectors: selectedSectors,
          reliability_score: reliability,
          is_active: true,
          plans_access: ['free', 'pro', 'business'],
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Erreur lors de l'ajout")
        return
      }
      setSources(prev => [json.source, ...prev])
      setSuccess('Source ajoutée !')
      setTimeout(() => { setShowForm(false); resetForm() }, 1500)
    } catch (e: any) {
      setError(e.message || "Erreur lors de l'ajout")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Bibliothèque de sources</h2>
          <p className="text-xs text-neutral-500 mt-1">{sources.length} sources configurées</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { resetBulk(); setShowBulk(true) }} className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-2">
            <Upload size={13} /> Import en masse
          </button>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary text-xs flex items-center gap-1.5 px-3 py-2">
            <Plus size={13} /> Source web
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
              {webSources.map(source => (
                <tr key={source.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-neutral-900">{source.name}</div>
                    {source.url && <div className="text-neutral-400 truncate max-w-[140px]">{source.url}</div>}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-0.5">
                      {source.countries?.slice(0,3).map(c => (
                        <span key={c} className="badge badge-gray text-[9px]">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-0.5 max-w-[100px]">
                      {source.sectors?.slice(0,2).map(s => (
                        <span key={s} className="badge badge-blue text-[9px]">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-neutral-600 uppercase">{METHOD_LABELS[source.scraping_method || 'rss'] || source.scraping_method}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`w-2 h-2 rounded-sm ${i <= (source.reliability_score || 3) ? 'bg-amber-500' : 'bg-neutral-200'}`} />
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-0.5">
                      {source.plans_access?.map(p => (
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
                    <button
                      onClick={() => toggleActive(source)}
                      disabled={toggling === source.id}
                      className={`text-[10px] px-2 py-1 rounded transition-colors font-medium disabled:opacity-50 ${
                        source.is_active
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-green-50 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {toggling === source.id ? '...' : source.is_active ? 'Désactiver' : 'Activer'}
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
        <div className="flex items-center gap-2 mb-4">
          <FileText size={15} className="text-purple-700" />
          <h3 className="text-sm font-bold text-neutral-900">Sources documentaires</h3>
        </div>
        {docSources.length > 0 ? (
          <div className="space-y-2">
            {docSources.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={14} className="text-purple-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-neutral-900">{doc.name}</div>
                  <div className="text-[10px] text-neutral-400">{doc.countries?.join(', ')}</div>
                </div>
                <span className={`badge ${doc.is_active ? 'badge-green' : 'badge-gray'}`}>
                  {doc.is_active ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => toggleActive(doc)}
                  disabled={toggling === doc.id}
                  className={`text-[10px] px-2 py-1 rounded transition-colors font-medium disabled:opacity-50 ${
                    doc.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {toggling === doc.id ? '...' : doc.is_active ? 'Désactiver' : 'Activer'}
                </button>
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

      {/* Modal ajout source */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-neutral-900">Nouvelle source web</h3>
              <button onClick={() => { setShowForm(false); resetForm() }} className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center">
                <X size={14} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
                <AlertCircle size={13} /> {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-xs text-green-700">
                <Check size={13} /> {success}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">Nom de la source *</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Jeune Afrique" />
              </div>
              <div>
                <label className="label">URL principale *</label>
                <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://jeuneafrique.com" />
              </div>
              <div>
                <label className="label">URL RSS (optionnel)</label>
                <input className="input" value={rssUrl} onChange={e => setRssUrl(e.target.value)} placeholder="https://jeuneafrique.com/feed/" />
              </div>
              <div>
                <label className="label">Méthode de scraping</label>
                <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
                  <option value="rss">RSS</option>
                  <option value="scraping">Scraping</option>
                  <option value="api">API</option>
                </select>
              </div>
              <div>
                <label className="label">Fiabilité : {reliability}/5</label>
                <input type="range" min={1} max={5} value={reliability} onChange={e => setReliability(Number(e.target.value))} className="w-full accent-blue-700" />
              </div>
              <div>
                <label className="label mb-2">Pays couverts</label>
                <div className="flex flex-wrap gap-1.5">
                  {COUNTRIES.map(c => (
                    <button key={c} type="button" onClick={() => setSelectedCountries(prev => toggleMulti(prev, c))}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${selectedCountries.includes(c) ? 'bg-blue-700 text-white border-blue-700' : 'border-neutral-200 text-neutral-600 hover:border-blue-300'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label mb-2">Secteurs couverts</label>
                <div className="flex flex-wrap gap-1.5">
                  {SECTORS.map(s => (
                    <button key={s} type="button" onClick={() => setSelectedSectors(prev => toggleMulti(prev, s))}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${selectedSectors.includes(s) ? 'bg-blue-700 text-white border-blue-700' : 'border-neutral-200 text-neutral-600 hover:border-blue-300'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => { setShowForm(false); resetForm() }} className="btn-ghost flex-1 text-sm py-2.5">Annuler</button>
              <button onClick={addSource} disabled={saving} className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50">
                {saving ? 'Ajout...' : 'Ajouter la source'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal import en masse ─────────────────────────── */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-5 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-neutral-900">Import en masse de sources</h3>
                <p className="text-xs text-neutral-500 mt-0.5">Collez des URLs (1 par ligne) ou importez un fichier CSV</p>
              </div>
              <button onClick={() => { setShowBulk(false); resetBulk() }} className="w-7 h-7 rounded-lg bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center">
                <X size={14} />
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700 flex-shrink-0">
                <AlertCircle size={13} /> {error}
              </div>
            )}

            {bulkResult ? (
              <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${bulkResult.failed === 0 ? 'bg-green-100' : 'bg-amber-100'}`}>
                  <Check size={28} className={bulkResult.failed === 0 ? 'text-green-600' : 'text-amber-600'} />
                </div>
                <div className="text-lg font-bold text-neutral-900 mb-1">{bulkResult.ok} source{bulkResult.ok > 1 ? 's' : ''} importée{bulkResult.ok > 1 ? 's' : ''}</div>
                {bulkResult.failed > 0 && <div className="text-sm text-red-500">{bulkResult.failed} échec{bulkResult.failed > 1 ? 's' : ''}</div>}
                <button onClick={() => { setShowBulk(false); resetBulk() }} className="btn-primary mt-6 px-6 py-2.5 text-sm">Fermer</button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col gap-4">
                {/* Zone de saisie */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="label mb-0">URLs à importer</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-400">ou</span>
                      <button onClick={() => fileRef.current?.click()} className="text-[10px] text-blue-700 hover:underline flex items-center gap-1">
                        <Upload size={10} /> Importer CSV
                      </button>
                      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvUpload} />
                    </div>
                  </div>
                  <textarea
                    className="input font-mono text-xs resize-none"
                    rows={7}
                    value={bulkText}
                    onChange={e => { setBulkText(e.target.value); parseBulkText(e.target.value) }}
                    placeholder={"https://jeuneafrique.com\nhttps://mondafrique.com | Mondafrique\nhttps://allafrique.com, All Africa\nfinancial-afrik.com"}
                  />
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Formats acceptés : <code className="bg-neutral-100 px-1 rounded">URL</code> · <code className="bg-neutral-100 px-1 rounded">URL | Nom</code> · <code className="bg-neutral-100 px-1 rounded">URL,Nom</code> · Fichier CSV (colonne url en première)
                  </p>
                </div>

                {/* Aperçu des URLs parsées */}
                {bulkRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Aperçu ({bulkRows.filter(r => r.valid).length} valides, {bulkRows.filter(r => !r.valid).length} invalides)</label>
                    </div>
                    <div className="border border-neutral-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                      {bulkRows.map((row, i) => (
                        <div key={i} className={`flex items-center gap-3 px-3 py-2 text-xs border-b border-neutral-100 last:border-0 ${row.valid ? '' : 'bg-red-50'}`}>
                          {row.valid
                            ? <Check size={12} className="text-green-500 flex-shrink-0" />
                            : <AlertCircle size={12} className="text-red-500 flex-shrink-0" />}
                          <span className="font-semibold text-neutral-900 w-36 truncate flex-shrink-0">{row.name}</span>
                          <span className="text-neutral-400 truncate flex-1">{row.url}</span>
                          {!row.valid && <span className="text-red-500 flex-shrink-0">{row.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paramètres communs */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Méthode par défaut</label>
                    <select className="input" value={bulkMethod} onChange={e => setBulkMethod(e.target.value)}>
                      <option value="scraping">Scraping</option>
                      <option value="rss">RSS</option>
                      <option value="api">API</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Fiabilité par défaut : {bulkReliability}/5</label>
                    <input type="range" min={1} max={5} value={bulkReliability} onChange={e => setBulkReliability(Number(e.target.value))} className="w-full mt-2 accent-blue-700" />
                  </div>
                </div>

                <div>
                  <label className="label mb-2">Pays (appliqués à toutes)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {COUNTRIES.map(c => (
                      <button key={c} type="button" onClick={() => setBulkCountries(prev => toggleMulti(prev, c))}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${bulkCountries.includes(c) ? 'bg-blue-700 text-white border-blue-700' : 'border-neutral-200 text-neutral-600 hover:border-blue-300'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label mb-2">Secteurs (appliqués à toutes)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SECTORS.map(s => (
                      <button key={s} type="button" onClick={() => setBulkSectors(prev => toggleMulti(prev, s))}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-all ${bulkSectors.includes(s) ? 'bg-blue-700 text-white border-blue-700' : 'border-neutral-200 text-neutral-600 hover:border-blue-300'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!bulkResult && (
              <div className="flex gap-3 mt-5 flex-shrink-0 pt-4 border-t border-neutral-100">
                <button onClick={() => { setShowBulk(false); resetBulk() }} className="btn-ghost flex-1 text-sm py-2.5">Annuler</button>
                <button
                  onClick={importBulk}
                  disabled={bulkImporting || bulkRows.filter(r => r.valid).length === 0}
                  className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bulkImporting ? <><Loader2 size={14} className="animate-spin" /> Import en cours...</> : `Importer ${bulkRows.filter(r => r.valid).length} source${bulkRows.filter(r => r.valid).length > 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
