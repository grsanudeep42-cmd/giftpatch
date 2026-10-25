import { INDIA_COUNTRY_CODE } from '../constants'

/**
 * Derive a deterministic email address from a normalised E.164 phone number.
 * Used for Supabase email+password auth (avoids needing an SMS provider).
 * Format: p919876543210@giftpass.event
 * The "p" prefix prevents leading-digit issues in some mail validators.
 */
export function phoneToEmail(normalisedPhone: string): string {
  const digits = normalisedPhone.replace(/\D/g, '')
  return `p${digits}@giftpass.event`
}

/**
 * Normalise Indian mobile numbers to E.164 format (+91XXXXXXXXXX)
 * Accepts 10-digit numbers, numbers prefixed with 91, or full +91 prefix.
 */
export function normaliseIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 10) {
    return `${INDIA_COUNTRY_CODE}${digits}`
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`
  }

  if (digits.length === 13 && digits.startsWith('091')) {
    return `+${digits.slice(1)}`
  }

  // Already E.164-ish
  if (raw.startsWith('+') && digits.length >= 10) {
    return `+${digits}`
  }

  throw new Error(
    `Invalid phone number: "${raw}". Please enter a 10-digit Indian mobile number.`
  )
}

/**
 * Validate that a normalised phone string looks like a valid Indian mobile number.
 */
export function isValidIndianPhone(phone: string): boolean {
  try {
    const normalised = normaliseIndianPhone(phone)
    // Indian mobile numbers: +91 followed by 6-9 starting digit, then 9 more digits
    return /^\+91[6-9]\d{9}$/.test(normalised)
  } catch {
    return false
  }
}

/**
 * Format a normalised phone for display: +91 98765 43210
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164.startsWith('+91') || e164.length !== 13) return e164
  const digits = e164.slice(3)
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
}

/**
 * Generate a cryptographically random hex token.
 */
export function generateToken(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a participant display ID like GFT-0001.
 */
export function generateParticipantId(index: number): string {
  return `GFT-${String(index).padStart(4, '0')}`
}

/**
 * Format a UTC ISO timestamp for local display.
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso))
}

/**
 * Format relative time (e.g. "2 minutes ago").
 */
export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return formatDateTime(iso)
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

/**
 * Parse a CSV line, handling quoted fields.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current.trim())
  return fields
}

/**
 * Parse an entire CSV string into rows of fields.
 * Skips empty lines.
 */
export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine)
}

/**
 * Download a string as a file.
 */
export function downloadFile(content: string, filename: string, mimeType = 'text/csv'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
