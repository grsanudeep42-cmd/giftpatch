import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from './ui/LoadingStates'
import { ROUTES } from '../constants'
import type { UserRole } from '../types'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: UserRole
  loginPath: string
}

const ROLE_HOME: Record<UserRole, string> = {
  attendee: ROUTES.ATTENDEE_PASS,
  staff:    ROUTES.STAFF_SCAN,
  admin:    ROUTES.ADMIN_DASHBOARD,
}

export function ProtectedRoute({ children, requiredRole, loginPath }: ProtectedRouteProps) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader />

  if (!session) {
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  // Correct role — allow through
  if (session.role === requiredRole) return <>{children}</>

  // Admin can also access staff routes
  if (requiredRole === 'staff' && session.role === 'admin') return <>{children}</>

  // Wrong role — redirect to their own home
  return <Navigate to={ROLE_HOME[session.role]} replace />
}
