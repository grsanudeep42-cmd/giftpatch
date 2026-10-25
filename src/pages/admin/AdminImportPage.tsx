import React, { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { getAdapter } from '../../lib/get-adapter'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { parseCsv } from '../../utils'
import type { ImportResult } from '../../types'

interface ParsedRow {
  name: string
  phone: string
  originalRow: number
}

const RESULT_ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />,
  duplicate: <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />,
  error: <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />,
}

export function AdminImportPage() {
  const adapter = getAdapter()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const handleFileChange = useCallback(async (file: File) => {
    setFile(file)
    setParseError('')
    setResult(null)

    const text = await file.text()
    const rows = parseCsv(text)

    if (rows.length < 2) {
      setParseError('File is empty or has no data rows.')
      setParsedRows([])
      return
    }

    // Try to detect columns from header
    const header = rows[0].map((h) => h.toLowerCase().trim())
    const nameIdx = header.findIndex((h) => h.includes('name'))
    const phoneIdx = header.findIndex((h) => h.includes('phone') || h.includes('mobile') || h.includes('number'))

    if (nameIdx === -1 || phoneIdx === -1) {
      setParseError(
        `Could not find required columns. Header found: [${header.join(', ')}]. ` +
          'Expected columns containing "name" and "phone" or "mobile".'
      )
      setParsedRows([])
      return
    }

    const parsed: ParsedRow[] = rows.slice(1).map((row, i) => ({
      name: row[nameIdx]?.trim() ?? '',
      phone: row[phoneIdx]?.trim() ?? '',
      originalRow: i + 2,
    }))

    setParsedRows(parsed.filter((r) => r.name || r.phone))
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (f) handleFileChange(f)
    },
    [handleFileChange]
  )

  const handleImport = async () => {
    if (!parsedRows.length) return
    setImporting(true)
    try {
      const importResult = await adapter.importParticipants(
        parsedRows.map((r) => ({ name: r.name, phone: r.phone }))
      )
      setResult(importResult)
      toast(
        `Import complete: ${importResult.imported} added, ${importResult.skipped} skipped, ${importResult.failed} failed`,
        importResult.failed > 0 ? 'warning' : 'success'
      )
    } catch (err: unknown) {
      toast((err as Error).message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const reset = () => {
    setFile(null)
    setParsedRows([])
    setParseError('')
    setResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-ink">Import Participants</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV file with <code className="bg-gray-100 px-1 rounded text-xs">name</code> and{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">phone</code> columns.
          </p>
        </div>

        {/* Format info */}
        <div className="alert-info mb-4">
          <FileText className="h-4 w-4 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-semibold mb-1">CSV Format Requirements</p>
            <p>Required columns: <strong>name</strong>, <strong>phone</strong> (or mobile/number)</p>
            <p className="mt-1">Phone numbers must be 10-digit Indian mobile numbers (will be normalised to +91).</p>
            <p className="mt-1">To export from Excel: File → Save As → CSV (Comma delimited)</p>
          </div>
        </div>

        {/* Drop zone */}
        {!file && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="card border-2 border-dashed border-gray-200 p-10 text-center cursor-pointer hover:border-brand-teal hover:bg-teal-50/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Upload CSV file"
          >
            <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-600">Drop your CSV file here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            />
          </div>
        )}

        {parseError && (
          <div className="alert-error mt-4">
            <XCircle className="h-4 w-4 flex-shrink-0" />
            <p>{parseError}</p>
          </div>
        )}

        {/* Preview */}
        {parsedRows.length > 0 && !result && (
          <div className="card mt-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">
                Preview — {parsedRows.length} rows from <span className="text-brand-teal">{file?.name}</span>
              </p>
              <Button variant="ghost" size="sm" onClick={reset} icon={<RefreshCw className="h-4 w-4" />}>
                Clear
              </Button>
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-50">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {['Row', 'Name', 'Phone'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {parsedRows.slice(0, 50).map((r) => (
                    <tr key={r.originalRow}>
                      <td className="px-4 py-2 text-xs text-gray-400">{r.originalRow}</td>
                      <td className="px-4 py-2 text-sm text-ink">{r.name || <span className="text-red-400">missing</span>}</td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-600">{r.phone || <span className="text-red-400">missing</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsedRows.length > 50 && (
              <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                Showing first 50 of {parsedRows.length} rows
              </p>
            )}
            <div className="p-4 border-t border-gray-100">
              <Button fullWidth loading={importing} onClick={handleImport} icon={<Upload className="h-4 w-4" />}>
                Import {parsedRows.length} Participants
              </Button>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="card mt-4 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-base font-bold text-ink mb-3">Import Complete</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-green-50 p-3 text-center">
                  <p className="text-2xl font-extrabold text-green-700">{result.imported}</p>
                  <p className="text-xs text-green-600 font-medium">Imported</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-extrabold text-amber-700">{result.skipped}</p>
                  <p className="text-xs text-amber-600 font-medium">Skipped</p>
                </div>
                <div className="rounded-xl bg-red-50 p-3 text-center">
                  <p className="text-2xl font-extrabold text-red-700">{result.failed}</p>
                  <p className="text-xs text-red-600 font-medium">Failed</p>
                </div>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {result.rows.map((row) => (
                <div key={row.row} className="flex items-center gap-3 px-4 py-2.5">
                  {RESULT_ICONS[row.status]}
                  <span className="text-xs text-gray-400 w-8 flex-shrink-0">#{row.row}</span>
                  <span className="text-sm flex-1 truncate text-ink">{row.name}</span>
                  {row.participant_id && (
                    <span className="text-xs font-mono text-brand-teal font-semibold">{row.participant_id}</span>
                  )}
                  {row.message && (
                    <span className="text-xs text-gray-400">{row.message}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100">
              <Button variant="secondary" fullWidth onClick={reset} icon={<Upload className="h-4 w-4" />}>
                Import Another File
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
