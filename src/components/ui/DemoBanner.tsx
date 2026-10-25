import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { IS_DEMO_MODE } from '../../constants'

export function DemoBanner() {
  if (!IS_DEMO_MODE) return null

  return (
    <div
      role="banner"
      className="sticky top-0 z-40 bg-amber-500 px-4 py-2.5 text-center"
      aria-label="Demo mode indicator"
    >
      <div className="flex items-center justify-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-900 flex-shrink-0" />
        <p className="text-xs font-bold tracking-wide text-amber-900 uppercase">
          Demo Mode — Sample Data Only — Not connected to any real database
        </p>
      </div>
    </div>
  )
}
