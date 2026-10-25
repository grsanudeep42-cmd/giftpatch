import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { AppSession } from '../types'
import { getAdapter } from '../lib/get-adapter'

interface AuthContextValue {
  session: AppSession | null
  loading: boolean
  login: (phone: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AppSession | null>(null)
  const [loading, setLoading] = useState(true)
  const adapter = getAdapter()

  const refreshSession = useCallback(async () => {
    try {
      const s = await adapter.getCurrentSession()
      setSession(s)
    } catch {
      setSession(null)
    }
  }, [adapter])

  useEffect(() => {
    refreshSession().finally(() => setLoading(false))
  }, [refreshSession])

  const login = async (phone: string, password: string) => {
    const s = await adapter.login(phone, password)
    setSession(s)
  }

  const logout = async () => {
    await adapter.logout()
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
