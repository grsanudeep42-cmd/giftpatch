import React, { useEffect, useState, useCallback } from 'react'
import {
  UserCheck,
  UserPlus,
  Trash2,
  RefreshCw,
  Phone,
  Lock,
  User,
  ShieldAlert,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { getAdapter } from '../../lib/get-adapter'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../contexts/ToastContext'
import { formatDateTime, formatPhoneDisplay } from '../../utils'
import type { StaffMember } from '../../types'

export function AdminStaffPage() {
  const adapter = getAdapter()
  const { toast } = useToast()

  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  // Add staff modal state
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('Staff@2026')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadStaff = useCallback(async () => {
    setLoading(true)
    try {
      const list = await adapter.getStaffList()
      setStaffList(list)
    } catch (err: unknown) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [adapter, toast])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const handleOpenAdd = () => {
    setName('')
    setPhone('')
    setPassword('Staff@2026')
    setFormError('')
    setAddModalOpen(true)
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!name.trim()) {
      setFormError('Staff name is required.')
      return
    }

    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length < 10) {
      setFormError('Please enter a valid 10-digit mobile number.')
      return
    }

    setSaving(true)
    try {
      await adapter.addStaff({
        name: name.trim(),
        phone: phone.trim(),
        password: password.trim() || 'Staff@2026',
      })
      toast(`Staff member "${name.trim()}" added successfully!`, 'success')
      setAddModalOpen(false)
      await loadStaff()
    } catch (err: unknown) {
      setFormError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteStaff = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await adapter.deleteStaff(deleteTarget.id)
      toast(`Staff member "${deleteTarget.name}" removed successfully.`, 'info')
      setDeleteTarget(null)
      await loadStaff()
    } catch (err: unknown) {
      toast((err as Error).message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-ink">Staff Management</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-teal/10 text-brand-teal">
                {staffList.length} Active {staffList.length === 1 ? 'Staff' : 'Staffs'}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Manage authorized scanner accounts for event counters. All staff can scan simultaneously.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadStaff}
              loading={loading}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAdd}
              icon={<UserPlus className="h-4 w-4" />}
            >
              Add Staff Member
            </Button>
          </div>
        </div>

        {/* Informative info banner */}
        <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-sky-900 leading-relaxed">
            <span className="font-semibold">Concurrent Scanning Supported:</span> Multiple staff members can scan QR codes from separate phones/counters simultaneously. The system uses atomic database row locking to guarantee that no gift can ever be redeemed twice.
          </div>
        </div>

        {/* Staff Table */}
        <div className="card overflow-hidden">
          {loading && staffList.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading staff roster...</div>
          ) : staffList.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={UserCheck}
                title="No staff members registered"
                description="Click 'Add Staff Member' to authorize scanner accounts for your event team."
                action={
                  <Button variant="primary" size="sm" onClick={handleOpenAdd} icon={<UserPlus className="h-4 w-4" />}>
                    Add First Staff
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Staff Member</th>
                    <th scope="col" className="px-6 py-3.5">Phone Number</th>
                    <th scope="col" className="px-6 py-3.5">Login Identity</th>
                    <th scope="col" className="px-6 py-3.5">Role / Status</th>
                    <th scope="col" className="px-6 py-3.5">Added Date</th>
                    <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-sm">
                  {staffList.map((staff) => (
                    <tr key={staff.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-brand-teal/10 flex items-center justify-center text-brand-teal font-bold text-sm">
                            {staff.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-ink">{staff.name}</div>
                            <div className="text-xs text-gray-400">ID: {staff.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-gray-700">
                        {formatPhoneDisplay(staff.phone)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 font-mono">
                        {staff.email || `p${staff.phone.replace(/\D/g, '')}@giftpass.event`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Scanner Staff
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                        {staff.created_at ? formatDateTime(staff.created_at) : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2"
                          onClick={() => setDeleteTarget(staff)}
                          title="Remove Staff Member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Staff Dialog */}
      <Dialog
        open={addModalOpen}
        onClose={() => !saving && setAddModalOpen(false)}
        title="Add Staff Member"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="add-staff-form"
              variant="primary"
              loading={saving}
              icon={<UserPlus className="h-4 w-4" />}
            >
              Add Staff
            </Button>
          </div>
        }
      >
        <form id="add-staff-form" onSubmit={handleAddSubmit} className="space-y-4 py-2">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <Input
            label="Staff Name / Counter Tag"
            placeholder="e.g. Counter 1 - Ramesh"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            leftIcon={<User className="h-4 w-4" />}
            required
            autoFocus
          />

          <Input
            label="Mobile Number (10 digits)"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
            leftIcon={<Phone className="h-4 w-4" />}
            hint="Staff uses this phone number on the login page to access the QR scanner."
            required
          />

          <Input
            label="Login Password"
            type="text"
            placeholder="Staff@2026"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            hint="Default is Staff@2026. Staff will type their mobile number and this password to log in."
            required
          />
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Remove Staff Member"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleting}
              onClick={handleDeleteStaff}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Remove
            </Button>
          </div>
        }
      >
        <div className="py-2 text-sm text-gray-600 space-y-2">
          <p>
            Are you sure you want to remove{' '}
            <strong className="text-ink">{deleteTarget?.name}</strong> (
            <span className="font-mono text-xs">{deleteTarget && formatPhoneDisplay(deleteTarget.phone)}</span>)?
          </p>
          <p className="text-xs text-gray-400">
            This will revoke their scanning access immediately. Any previous redemption history they completed will remain preserved in the audit log.
          </p>
        </div>
      </Dialog>
    </AdminLayout>
  )
}
