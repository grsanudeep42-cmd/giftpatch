import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import { ToastContainer } from './components/ui/ToastContainer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ROUTES } from './constants'

// Pages
import { LoginPage } from './pages/LoginPage'
import { AttendePassPage } from './pages/attendee/AttendeePassPage'
import { StaffScanPage } from './pages/staff/StaffScanPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminParticipantsPage } from './pages/admin/AdminParticipantsPage'
import { AdminAddParticipantPage } from './pages/admin/AdminAddParticipantPage'
import { AdminImportPage } from './pages/admin/AdminImportPage'
import { AdminStaffPage } from './pages/admin/AdminStaffPage'
import { AdminHistoryPage } from './pages/admin/AdminHistoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Single login for all roles */}
            <Route path={ROUTES.HOME} element={<LoginPage />} />
            <Route path={ROUTES.LOGIN} element={<LoginPage />} />

            {/* Attendee */}
            <Route
              path={ROUTES.ATTENDEE_PASS}
              element={
                <ProtectedRoute requiredRole="attendee" loginPath={ROUTES.LOGIN}>
                  <AttendePassPage />
                </ProtectedRoute>
              }
            />

            {/* Staff */}
            <Route
              path={ROUTES.STAFF_SCAN}
              element={
                <ProtectedRoute requiredRole="staff" loginPath={ROUTES.LOGIN}>
                  <StaffScanPage />
                </ProtectedRoute>
              }
            />

            {/* Admin */}
            <Route
              path={ROUTES.ADMIN_DASHBOARD}
              element={
                <ProtectedRoute requiredRole="admin" loginPath={ROUTES.LOGIN}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.ADMIN_PARTICIPANTS}
              element={
                <ProtectedRoute requiredRole="admin" loginPath={ROUTES.LOGIN}>
                  <AdminParticipantsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.ADMIN_PARTICIPANTS_NEW}
              element={
                <ProtectedRoute requiredRole="admin" loginPath={ROUTES.LOGIN}>
                  <AdminAddParticipantPage />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.ADMIN_IMPORT}
              element={
                <ProtectedRoute requiredRole="admin" loginPath={ROUTES.LOGIN}>
                  <AdminImportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.ADMIN_STAFF}
              element={
                <ProtectedRoute requiredRole="admin" loginPath={ROUTES.LOGIN}>
                  <AdminStaffPage />
                </ProtectedRoute>
              }
            />
            <Route
              path={ROUTES.ADMIN_HISTORY}
              element={
                <ProtectedRoute requiredRole="admin" loginPath={ROUTES.LOGIN}>
                  <AdminHistoryPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
          </Routes>
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
