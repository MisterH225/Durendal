'use client'
import { useState, useCallback } from 'react'
import { Download, Loader2 } from 'lucide-react'

export default function ExportPdfButton({ reportTitle }: { reportTitle: string }) {
  const [exporting, setExporting] = useState(false)

  const exportPdf = useCallback(async () => {
    setExporting(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default

      const el = document.getElementById('report-content')
      if (!el) return

      const clone = el.cloneNode(true) as HTMLElement

      clone.querySelectorAll('[data-no-pdf]').forEach(n => n.remove())

      clone.style.maxWidth = '800px'
      clone.style.margin = '0 auto'
      clone.style.padding = '24px'
      clone.style.fontSize = '12px'

      const slug = reportTitle
        .toLowerCase()
        .replace(/[^a-z0-9àâäéèêëïîôùûüç]+/gi, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 60)
      const filename = `${slug || 'rapport'}.pdf`

      await html2pdf()
        .set({
          margin:      [12, 10, 12, 10],
          filename,
          image:       { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
          jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak:   { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(clone)
        .save()
    } catch (e) {
      console.error('PDF export failed:', e)
    } finally {
      setExporting(false)
    }
  }, [reportTitle])

  return (
    <button
      onClick={exportPdf}
      disabled={exporting}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 disabled:opacity-50 transition-colors"
    >
      {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {exporting ? 'Export en cours…' : 'Exporter PDF'}
    </button>
  )
}
