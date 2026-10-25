import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Gift, LogOut, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { APP_NAME, ROUTES } from '../constants'
import { Button } from './ui/Button'

interface NavbarProps {
  title?: string
  backTo?: string
  backLabel?: string
}

export function Navbar({ title, backTo, backLabel }: NavbarProps) {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate(ROUTES.HOME)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          {backTo && (
            <Link
              to={backTo}
              className="mr-1 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-ink transition-colors"
              aria-label={backLabel ?? 'Go back'}
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </Link>
          )}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal">
              <Gift className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-ink">{title ?? APP_NAME}</span>
          </div>
        </div>

        {session && (
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5">
              <User className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-xs font-medium text-gray-600 capitalize">{session.role}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
