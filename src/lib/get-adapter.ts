/**
 * Adapter factory — selects demo or production adapter.
 * Vite replaces import.meta.env.VITE_DEMO_MODE at build time via dead-code elimination,
 * so the demo adapter module is excluded from production bundles.
 */

import { IS_DEMO_MODE } from '../constants'
import type { DataAdapter } from './adapter'
import { demoAdapter } from './demo-adapter'
import { supabaseAdapter } from './supabase-adapter'

export function getAdapter(): DataAdapter {
  if (IS_DEMO_MODE) {
    return demoAdapter
  }
  return supabaseAdapter
}
