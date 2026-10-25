import React, { useEffect, useState, useCallback } from 'react'
import { Search, Filter, Download, RefreshCw, Users } from 'lucide-react'
import { getAdapter } from '../../lib/get-adapter'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { SkeletonRow } from '../../components/ui/LoadingStates'
import { useToast } from '../../contexts/ToastContext'
import { PAGE_SIZE } from '../../constants'
import { formatDateTime, formatPhoneDisplay, downloadFile } from '../../utils'
import type { Participant } from '../../types'

type StatusFilter = 'all' | 'pending' | 'collected'

export function AdminParticipantsPage() {
  const adapter = getAdapter()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [total, setTotal] = useState(0)
  const [exporting, setExporting] = useState(false)

  const loadParticipants = useCallback(async () => {
    setLoading(true)
    try {
      const result = await adapter.getParticipants({ search, status, page, pageSize: PAGE_SIZE })
      setParticipants(result.data)
      setTotal(result.total)
    } catch (err: unknown) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [adapter, search, status, page])

  useEffect(() => {
    setPage(1)
  }, [search, status])

  useEffect(() => {
    loadParticipants()
  }, [loadParticipants])

  const handleExport = async () => {
    setExporting(true)
    try {
      const csv = await adapter.exportParticipantsCsv()
      downloadFile(csv, `giftpass-export-${new Date().toISOString().slice(0, 10)}.csv`)
      toast('Export downloaded', 'success')
    } catch (err: unknown) {
      toast((err as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold text-ink">Participants</h1>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            icon={<Download className="h-4 w-4" />}
          >
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="card p-4 mb-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID or phone…"
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {(['all', 'pending', 'collected'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  status === s
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-gray-500 hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={loadParticipants} icon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  {['Participant ID', 'Name', 'Phone', 'Status', 'Registered'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                ) : participants.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={Users}
                        title="No participants found"
                        description="Try adjusting your search or filters."
                      />
                    </td>
                  </tr>
                ) : (
                  participants.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-semibold text-ink">{p.participant_id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-ink truncate max-w-[200px] block">{p.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 font-mono">{formatPhoneDisplay(p.phone)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.gift_status} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-400">{formatDateTime(p.created_at)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      </div>
    </AdminLayout>
  )
}
