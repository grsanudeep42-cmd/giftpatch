import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Phone, User, CheckCircle2 } from 'lucide-react'
import { getAdapter } from '../../lib/get-adapter'
import { AdminLayout } from '../../components/admin/AdminLayout'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../contexts/ToastContext'
import { ROUTES } from '../../constants'
import { normaliseIndianPhone, isValidIndianPhone } from '../../utils'
import type { Participant } from '../../types'

export function AdminAddParticipantPage() {
  const adapter = getAdapter()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<Participant | null>(null)
  const [errors, setErrors] = useState<{ name?: string; phone?: string; general?: string }>({})

  const validate = () => {
    const errs: typeof errors = {}
    if (!name.trim()) errs.name = 'Full name is required'
    if (!phone.trim()) {
      errs.phone = 'Phone number is required'
    } else if (!isValidIndianPhone(phone)) {
      errs.phone = 'Enter a valid 10-digit Indian mobile number'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setErrors({})

    try {
      const normalisedPhone = normaliseIndianPhone(phone)
      const participant = await adapter.addParticipant({ name: name.trim(), phone: normalisedPhone })
      setSuccess(participant)
      toast(`${participant.participant_id} created`, 'success')
    } catch (err: unknown) {
      const message = (err as Error).message
      if (message.includes('already exists') || message.includes('duplicate')) {
        setErrors({ phone: 'A participant with this phone number already exists.' })
      } else {
        setErrors({ general: message })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleAddAnother = () => {
    setSuccess(null)
    setName('')
    setPhone('')
    setErrors({})
  }

  if (success) {
    return (
      <AdminLayout>
        <div className="p-4 sm:p-6 lg:p-8 max-w-lg mx-auto">
          <div className="card p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-extrabold text-ink">Participant Added</h2>
            <div className="mt-4 rounded-xl bg-gray-50 p-4 text-left">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Name</span>
                  <span className="text-sm font-semibold text-ink">{success.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Participant ID</span>
                  <span className="text-sm font-mono font-bold text-brand-teal">{success.participant_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Phone</span>
                  <span className="text-sm font-mono text-gray-600">{success.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Gift Status</span>
                  <span className="badge-pending">Pending</span>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" fullWidth onClick={handleAddAnother} icon={<UserPlus className="h-4 w-4" />}>
                Add Another
              </Button>
              <Button fullWidth onClick={() => navigate(ROUTES.ADMIN_PARTICIPANTS)}>
                View All
              </Button>
            </div>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-ink">Add Participant</h1>
          <p className="text-sm text-gray-500 mt-1">
            The participant ID and QR token are generated automatically on the server.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {errors.general && (
            <div className="alert-error" role="alert">
              <p>{errors.general}</p>
            </div>
          )}

          <Input
            label="Full Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Participant's full name"
            required
            leftIcon={<User className="h-4 w-4" />}
            error={errors.name}
            disabled={loading}
          />

          <Input
            label="Phone Number"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit Indian mobile number"
            required
            leftIcon={<Phone className="h-4 w-4" />}
            hint="Will be normalised to +91 format"
            error={errors.phone}
            disabled={loading}
          />

          <div className="pt-2">
            <Button type="submit" fullWidth loading={loading} icon={<UserPlus className="h-4 w-4" />}>
              Add Participant
            </Button>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
