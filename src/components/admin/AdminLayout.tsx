import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, UserPlus, Upload, History, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { ROUTES, APP_NAME } from '../../constants'
import { DemoBanner } from '../ui/DemoBanner'

const NAV_ITEMS = [
  { to: ROUTES.ADMIN_DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
  { to: ROUTES.ADMIN_PARTICIPANTS, icon: Users, label: 'Participants' },
  { to: ROUTES.ADMIN_PARTICIPANTS_NEW, icon: UserPlus, label: 'Add Participant' },
  { to: ROUTES.ADMIN_IMPORT, icon: Upload, label: 'Import CSV' },
  { to: ROUTES.ADMIN_HISTORY, icon: History, label: 'History' },
]

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate(ROUTES.HOME)
  }

  return (
    <div className="min-h-dvh bg-cloud">
      <DemoBanner />

      {/* Top nav on mobile, sidebar on desktop */}
      <div className="flex flex-col lg:flex-row min-h-dvh">
        {/* Sidebar */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-ink z-20">
          <div className="flex flex-col flex-1 overflow-y-auto py-6">
            <div className="px-5 mb-8">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-teal">
                  <LayoutDashboard className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold text-white">{APP_NAME} Admin</span>
              </div>
            </div>
            <nav className="flex-1 px-3 space-y-1">
              {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
                const active = location.pathname === to
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-teal text-white'
                        : 'text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </nav>
            <div className="px-3 pt-4 border-t border-white/10">
              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile top nav */}
        <header className="lg:hidden sticky top-0 z-30 bg-ink border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-teal">
                <LayoutDashboard className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-bold text-white">{APP_NAME}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
          {/* Mobile nav scroll */}
          <nav className="flex overflow-x-auto px-4 pb-2 gap-1 scrollbar-none">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
              const active = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-brand-teal text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 lg:ml-64 min-h-dvh">
          {children}
        </main>
      </div>
    </div>
  )
}
