import React from 'react'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
        <Icon className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="mb-1.5 text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mb-6 text-sm text-gray-500 max-w-xs">{description}</p>}
      {action}
    </div>
  )
}
