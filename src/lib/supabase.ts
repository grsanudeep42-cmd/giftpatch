import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Strip any non-ASCII characters or invisible Unicode copy-paste artifacts
const supabaseUrl = (rawUrl || '').replace(/[^\x20-\x7E]/g, '').trim()
const supabaseAnonKey = (rawKey || '').replace(/[^\x20-\x7E]/g, '').trim()

// Validate required env vars at startup (production only)
if (import.meta.env.PROD) {
  if (!supabaseUrl || supabaseUrl === 'your-supabase-url') {
    throw new Error(
      '[GiftPass] FATAL: VITE_SUPABASE_URL is not configured. ' +
        'Set this environment variable before deploying.'
    )
  }
  if (!supabaseAnonKey || supabaseAnonKey === 'your-supabase-anon-key') {
    throw new Error(
      '[GiftPass] FATAL: VITE_SUPABASE_ANON_KEY is not configured. ' +
        'Set this environment variable before deploying.'
    )
  }
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
)
