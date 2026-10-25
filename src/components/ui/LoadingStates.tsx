import React from 'react'

export function Spinner({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin text-brand-teal ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="h-10 w-10" />
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="card p-5 space-y-3">
      <div className="skeleton h-4 w-24 rounded" />
      <div className="skeleton h-8 w-16 rounded" />
      <div className="skeleton h-3 w-32 rounded" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 w-full max-w-[120px] rounded" />
        </td>
      ))}
    </tr>
  )
}
