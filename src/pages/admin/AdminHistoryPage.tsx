import React, { useEffect, useState, useCallback } from 'react'
import { History, Gift, AlertTriangle, X, RefreshCw } from 'lucide-react'
import { getAdapter } from '../../lib/get-adapter'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { SkeletonRow } from '../../components/ui/LoadingStates'
import { useToast } from '../../contexts/ToastContext'
import { PAGE_SIZE } from '../../constants'
import { formatDateTime } from '../../utils'
import type { GiftRedemption, ScanAuditEvent } from '../../types'

type Tab = 'redemptions' | 'audit'

const RESULT_STYLES: Record<string, string> = {
  success: 'badge-collected',
  already_collected: 'badge-error',
  invalid_token: 'badge-error',
  error: 'badge-error',
}

const RESULT_LABELS: Record<string, string> = {
  success: 'Success',
  already_collected: 'Duplicate',
  invalid_token: 'Invalid QR',
  error: 'Error',
}

export function AdminHistoryPage() {
  const adapter = getAdapter()
  const { toast } = useToast()

  const [tab, setTab] = useState<Tab>('redemptions')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [redemptions, setRedemptions] = useState<GiftRedemption[]>([])
  const [auditEvents, setAuditEvents] = useState<ScanAuditEvent[]>([])
  const [total, setTotal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'redemptions') {
        const result = await adapter.getRedemptionHistory({ page, pageSize: PAGE_SIZE })
        setRedemptions(result.data)
        setTotal(result.total)
      } else {
        const result = await adapter.getScanAuditEvents({ page, pageSize: PAGE_SIZE })
        setAuditEvents(result.data)
        setTotal(result.total)
      }
    } catch (err: unknown) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [adapter, tab, page])

  useEffect(() => {
    setPage(1)
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold text-ink">History</h1>
          <Button variant="secondary" size="sm" onClick={load} loading={loading} icon={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
        </div>

        {/* Tab switcher */}
        <div className="card p-1 mb-4 flex gap-1 max-w-xs">
          {(['redemptions', 'audit'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-colors capitalize ${
                tab === t ? 'bg-brand-teal text-white' : 'text-gray-500 hover:text-ink'
              }`}
            >
              {t === 'redemptions' ? <Gift className="h-4 w-4" /> : <History className="h-4 w-4" />}
              {t === 'redemptions' ? 'Redemptions' : 'Scan Audit'}
            </button>
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            {tab === 'redemptions' ? (
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Participant ID', 'Name', 'Collected At', 'Staff'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : redemptions.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={Gift} title="No redemptions yet" description="Redemptions will appear here after gifts are issued." />
                      </td>
                    </tr>
                  ) : (
                    redemptions.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-ink">
                          {r.participant?.participant_id ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{r.participant?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(r.redeemed_at)}</td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-400 truncate max-w-[120px]">
                          {r.staff_user_id.slice(0, 12)}…
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {['Scanned At', 'Participant', 'Result', 'Details'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : auditEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState icon={History} title="No scan events yet" description="Scan events will appear here as staff use the scanner." />
                      </td>
                    </tr>
                  ) : (
                    auditEvents.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(e.scanned_at)}</td>
                        <td className="px-4 py-3 font-mono text-sm text-ink">
                          {e.participant?.participant_id ?? e.participant_id?.slice(0, 8) ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={RESULT_STYLES[e.result_type] ?? 'badge-pending'}>
                            {RESULT_LABELS[e.result_type] ?? e.result_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{e.details ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      </div>
    </AdminLayout>
  )
}
