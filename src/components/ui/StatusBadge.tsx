import React from 'react'
import { Clock, Gift, CheckCircle2 } from 'lucide-react'
import type { GiftStatus } from '../../types'

interface StatusBadgeProps {
  status: GiftStatus
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  if (status === 'collected') {
    return (
      <span className={`badge-collected ${size === 'sm' ? 'text-xs py-0.5 px-2' : ''}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        Collected
      </span>
    )
  }
  return (
    <span className={`badge-pending ${size === 'sm' ? 'text-xs py-0.5 px-2' : ''}`}>
      <Clock className="h-3.5 w-3.5" />
      Pending
    </span>
  )
}
