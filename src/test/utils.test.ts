/**
 * Unit tests for utility functions — normalisation, formatting, CSV parsing.
 */
import { describe, it, expect } from 'vitest'
import {
  normaliseIndianPhone,
  isValidIndianPhone,
  formatPhoneDisplay,
  generateParticipantId,
  generateToken,
  parseCsv,
  parseCsvLine,
} from '../utils/index'

describe('normaliseIndianPhone', () => {
  it('normalises a bare 10-digit number', () => {
    expect(normaliseIndianPhone('9876543210')).toBe('+919876543210')
  })

  it('normalises with leading 91', () => {
    expect(normaliseIndianPhone('919876543210')).toBe('+919876543210')
  })

  it('passes through an already-prefixed number', () => {
    expect(normaliseIndianPhone('+919876543210')).toBe('+919876543210')
  })

  it('strips spaces and dashes', () => {
    expect(normaliseIndianPhone('98765 43210')).toBe('+919876543210')
  })

  it('throws on an obviously invalid number', () => {
    expect(() => normaliseIndianPhone('12345')).toThrow()
  })
})

describe('isValidIndianPhone', () => {
  it('accepts valid Indian mobile numbers', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true)
    expect(isValidIndianPhone('6543219876')).toBe(true)
    expect(isValidIndianPhone('7001234567')).toBe(true)
  })

  it('rejects numbers starting with 0–5', () => {
    expect(isValidIndianPhone('1234567890')).toBe(false)
    expect(isValidIndianPhone('5123456789')).toBe(false)
  })

  it('rejects too-short numbers', () => {
    expect(isValidIndianPhone('98765')).toBe(false)
  })
})

describe('formatPhoneDisplay', () => {
  it('formats E.164 Indian number with spaces', () => {
    expect(formatPhoneDisplay('+919876543210')).toBe('+91 98765 43210')
  })

  it('passes through non-Indian numbers unchanged', () => {
    expect(formatPhoneDisplay('+12025551234')).toBe('+12025551234')
  })
})

describe('generateParticipantId', () => {
  it('pads to 4 digits', () => {
    expect(generateParticipantId(1)).toBe('GFT-0001')
    expect(generateParticipantId(42)).toBe('GFT-0042')
    expect(generateParticipantId(250)).toBe('GFT-0250')
  })

  it('handles numbers above 4 digits', () => {
    expect(generateParticipantId(10001)).toBe('GFT-10001')
  })
})

describe('generateToken', () => {
  it('generates a hex string of the right length', () => {
    const token = generateToken(32)
    expect(token).toHaveLength(64) // 32 bytes → 64 hex chars
    expect(token).toMatch(/^[0-9a-f]+$/)
  })

  it('generates unique tokens', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
  })
})

describe('parseCsvLine', () => {
  it('splits a simple comma-separated line', () => {
    expect(parseCsvLine('Alice,9876543210')).toEqual(['Alice', '9876543210'])
  })

  it('handles quoted fields containing commas', () => {
    expect(parseCsvLine('"Alice, Jr.",9876543210')).toEqual(['Alice, Jr.', '9876543210'])
  })

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsvLine('"Say ""hello""",9876543210')).toEqual(['Say "hello"', '9876543210'])
  })
})

describe('parseCsv', () => {
  it('parses a complete CSV string', () => {
    const csv = 'name,phone\nAlice,9876543210\nBob,8765432109'
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(['name', 'phone'])
    expect(rows[1]).toEqual(['Alice', '9876543210'])
    expect(rows[2]).toEqual(['Bob', '8765432109'])
  })

  it('skips blank lines', () => {
    const csv = 'name,phone\n\nAlice,9876543210\n\n'
    expect(parseCsv(csv)).toHaveLength(2)
  })

  it('handles Windows-style line endings', () => {
    const csv = 'name,phone\r\nAlice,9876543210\r\n'
    expect(parseCsv(csv)).toHaveLength(2)
  })
})
