/**
 * Tests for the CSV sanitization helper used in exportParticipantsCsv.
 * These test the pure sanitize/escape logic extracted into standalone functions
 * identical to what supabase-adapter.ts applies.
 */
import { describe, it, expect } from 'vitest'

// Mirror of the sanitize/escape helpers in supabase-adapter.ts
const sanitize = (val: string): string => {
  if (val && /^[=+\-@\t\r]/.test(val)) return `\t${val}`
  return val
}
const escape = (val: string): string => `"${val.replace(/"/g, '""')}"`

describe('CSV formula injection protection', () => {
  it('prefixes = with tab (Excel formula start)', () => {
    expect(sanitize('=cmd|/C calc')).toBe('\t=cmd|/C calc')
  })

  it('prefixes + with tab', () => {
    expect(sanitize('+91XXXXXXXX')).toBe('\t+91XXXXXXXX')
  })

  it('prefixes - with tab', () => {
    expect(sanitize('-1+2')).toBe('\t-1+2')
  })

  it('prefixes @ with tab', () => {
    expect(sanitize('@SUM(A1:A10)')).toBe('\t@SUM(A1:A10)')
  })

  it('does not modify safe values', () => {
    expect(sanitize('Rahul Sharma')).toBe('Rahul Sharma')
    expect(sanitize('GFT-0001')).toBe('GFT-0001')
    expect(sanitize('pending')).toBe('pending')
    expect(sanitize('')).toBe('')
  })

  it('escapes double-quotes in names', () => {
    expect(escape('O"Brien')).toBe('"O""Brien"')
  })

  it('wraps values in double-quotes', () => {
    expect(escape('Rahul Sharma')).toBe('"Rahul Sharma"')
  })
})
