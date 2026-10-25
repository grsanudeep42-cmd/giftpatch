import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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
