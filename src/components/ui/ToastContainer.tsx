import React from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import type { ToastType } from '../../contexts/ToastContext'

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />,
  error: <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />,
  info: <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />,
}

const STYLES: Record<ToastType, string> = {
  success: 'bg-white border-green-200 text-green-900',
  error: 'bg-white border-red-200 text-red-900',
  warning: 'bg-white border-amber-200 text-amber-900',
  info: 'bg-white border-blue-200 text-blue-900',
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast()

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4"
    >
      {toasts.map((t: import('../../contexts/ToastContext').Toast) => (
        <div
          key={t.id}
          role="alert"
          className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-card-lg ${STYLES[t.type]}`}
        >
          {ICONS[t.type]}
          <p className="flex-1 text-sm font-medium">{t.message}</p>
          <button
            onClick={() => dismiss(t.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
