import React, { useEffect, useState, useCallback } from 'react'
import { Users, Gift, Clock, BarChart3, AlertTriangle, X, RefreshCw } from 'lucide-react'
import { getAdapter } from '../../lib/get-adapter'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { SkeletonCard } from '../../components/ui/LoadingStates'
import { Button } from '../../components/ui/Button'
import { STATS_POLL_INTERVAL } from '../../constants'
import type { DashboardStats } from '../../types'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  sub?: string
}

function StatCard({ label, value, icon, color, sub }: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className={`mt-2 text-3xl font-extrabold ${color}`}>{value}</p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${color.includes('teal') ? 'bg-teal-50' : color.includes('green') ? 'bg-green-50' : color.includes('amber') ? 'bg-amber-50' : color.includes('red') ? 'bg-red-50' : 'bg-blue-50'}`}>
          {icon}
        </div>
      </div>
      {typeof value === 'number' && label === 'Collected' && (
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-green-500 transition-all duration-700"
              style={{ width: `0%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">Distribution Progress</p>
        <span className="text-2xl font-extrabold text-brand-teal">{percent}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-3 rounded-full bg-gradient-to-r from-brand-teal to-brand-teal-light transition-all duration-700"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-gray-400">{percent}% of gifts distributed</p>
    </div>
  )
}

export function AdminDashboardPage() {
  const adapter = getAdapter()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const data = await adapter.getDashboardStats()
      setStats(data)
      setLastUpdated(new Date())
      setError('')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [adapter])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, STATS_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [loadStats])

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
            {lastUpdated && (
              <p className="text-xs text-gray-400 mt-0.5">
                Updated {lastUpdated.toLocaleTimeString('en-IN')} · auto-refreshes every 15s
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadStats}
            icon={<RefreshCw className="h-4 w-4" />}
            loading={loading}
          >
            Refresh
          </Button>
        </div>

        {error && (
          <div className="alert-error mb-6">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading && !stats ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : stats ? (
          <>
            {/* Progress bar */}
            <div className="mb-4">
              <ProgressBar percent={stats.percent_collected} />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="Total Participants"
                value={stats.total}
                icon={<Users className="h-5 w-5 text-blue-600" />}
                color="text-blue-600"
              />
              <StatCard
                label="Collected"
                value={stats.collected}
                icon={<Gift className="h-5 w-5 text-green-600" />}
                color="text-green-600"
                sub={`of ${stats.total} participants`}
              />
              <StatCard
                label="Pending"
                value={stats.pending}
                icon={<Clock className="h-5 w-5 text-amber-600" />}
                color="text-amber-600"
                sub="yet to collect"
              />
              <StatCard
                label="Duplicate Scans"
                value={stats.duplicate_scan_attempts}
                icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
                color="text-red-600"
                sub="already-collected attempts"
              />
              <StatCard
                label="Invalid QR Scans"
                value={stats.invalid_qr_attempts}
                icon={<X className="h-5 w-5 text-red-500" />}
                color="text-red-500"
                sub="unrecognised codes"
              />
              <StatCard
                label="Completion"
                value={`${stats.percent_collected}%`}
                icon={<BarChart3 className="h-5 w-5 text-brand-teal" />}
                color="text-brand-teal"
              />
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  )
}
