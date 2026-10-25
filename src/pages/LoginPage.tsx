import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Phone, Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { DemoBanner } from '../components/ui/DemoBanner'
import {
  APP_NAME,
  EVENT_NAME,
  ROUTES,
  IS_DEMO_MODE,
  DEMO_ATTENDEE_PHONE,
  DEMO_ATTENDEE_PASSWORD,
  DEMO_STAFF_PHONE,
  DEMO_STAFF_PASSWORD,
  DEMO_ADMIN_PHONE,
  DEMO_ADMIN_PASSWORD,
} from '../constants'
import type { UserRole } from '../types'

const ROLE_DESTINATIONS: Record<UserRole, string> = {
  attendee: ROUTES.ATTENDEE_PASS,
  staff: ROUTES.STAFF_SCAN,
  admin: ROUTES.ADMIN_DASHBOARD,
}

export function LoginPage() {
  const { session, loading, login } = useAuth()
  const navigate = useNavigate()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // If already logged in, redirect immediately to role portal
  useEffect(() => {
    if (!loading && session) {
      navigate(ROLE_DESTINATIONS[session.role], { replace: true })
    }
  }, [session, loading, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(phone.trim(), password)
      // navigate handled by useEffect above once session is updated
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <div className="min-h-dvh bg-cloud flex flex-col">
      <DemoBanner />

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Logo / title */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-teal shadow-lg mb-4">
            <LogIn className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-ink">{APP_NAME}</h1>
          <p className="mt-1 text-gray-500 text-sm">{EVENT_NAME}</p>
        </div>

        <div className="card w-full max-w-sm p-6 space-y-5">
          <div className="text-center">
            <h2 className="text-lg font-bold text-ink">Sign in</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Enter your registered phone number and password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Phone number"
              type="tel"
              inputMode="numeric"
              placeholder="98765 43210"
              value={phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
              leftIcon={<Phone className="h-4 w-4" />}
              autoComplete="tel"
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              autoComplete="current-password"
              required
            />

            {error && (
              <div className="alert-error">
                <p className="text-sm">{error}</p>
              </div>
            )}

            <Button type="submit" fullWidth loading={submitting} className="py-3 text-base">
              Sign in
            </Button>
          </form>

          <p className="text-center text-xs text-gray-400">
            RBAC auto-routes to Participant Pass, Scanner, or Admin Dashboard.
          </p>
        </div>

        {/* Demo credentials helper */}
        {IS_DEMO_MODE && (
          <div className="mt-6 w-full max-w-sm card p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Demo credentials</p>
            {[
              { label: 'Attendee', phone: DEMO_ATTENDEE_PHONE, password: DEMO_ATTENDEE_PASSWORD },
              { label: 'Staff', phone: DEMO_STAFF_PHONE, password: DEMO_STAFF_PASSWORD },
              { label: 'Admin', phone: DEMO_ADMIN_PHONE, password: DEMO_ADMIN_PASSWORD },
            ].map(({ label, phone: p, password: pw }) => (
              <button
                key={label}
                type="button"
                className="w-full text-left rounded-xl border border-gray-200 px-3 py-2 hover:bg-gray-50 transition-colors"
                onClick={() => {
                  setPhone(p)
                  setPassword(pw)
                  setError('')
                }}
              >
                <span className="text-xs font-semibold text-brand-teal">{label}</span>
                <span className="ml-2 text-xs text-gray-500 font-mono">
                  {p} / {pw}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
