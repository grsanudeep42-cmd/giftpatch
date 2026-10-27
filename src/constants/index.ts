// App-wide constants

export const APP_NAME = 'GiftPass'
export const EVENT_NAME = 'Annual Celebration 2026'

// Mode detection — never silently fall back
export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
export const IS_PRODUCTION = import.meta.env.PROD

// Validate demo mode is never active in production builds
if (IS_PRODUCTION && IS_DEMO_MODE) {
  throw new Error(
    '[GiftPass] FATAL: VITE_DEMO_MODE=true is not allowed in a production build. ' +
      'Remove VITE_DEMO_MODE from your production environment variables.'
  )
}

// Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  ATTENDEE_PASS: '/attendee/pass',
  STAFF_SCAN: '/staff/scan',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_PARTICIPANTS: '/admin/participants',
  ADMIN_PARTICIPANTS_NEW: '/admin/participants/new',
  ADMIN_IMPORT: '/admin/import',
  ADMIN_STAFF: '/admin/staff',
  ADMIN_HISTORY: '/admin/history',
} as const

// Phone normalisation
export const INDIA_COUNTRY_CODE = '+91'

// Demo credentials (only used in demo mode)
export const DEMO_ATTENDEE_PHONE = '9800000001'
export const DEMO_ATTENDEE_PASSWORD = 'Demo@2026'
export const DEMO_STAFF_PHONE = '9800000251'
export const DEMO_STAFF_PASSWORD = 'Staff@Demo2026'
export const DEMO_ADMIN_PHONE = '9800000252'
export const DEMO_ADMIN_PASSWORD = 'Admin@Demo2026'

// Pagination
export const PAGE_SIZE = 25

// Polling interval for dashboard stats (ms)
export const STATS_POLL_INTERVAL = 15_000
