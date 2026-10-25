/**
 * Demo data fixtures — 250 synthetic participants.
 * These records are CLEARLY labelled as DEMO data and never sent to any real database.
 */

import { generateParticipantId, generateToken } from '../utils'
import type { Participant, GiftRedemption, ScanAuditEvent } from '../types'

// Deterministic seed for reproducibility across resets
function seededRandom(seed: number) {
  let s = seed
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

const FIRST_NAMES = [
  'Aarav', 'Aditya', 'Akash', 'Amit', 'Ananya', 'Anjali', 'Arjun', 'Aryan',
  'Deepa', 'Deepak', 'Divya', 'Gaurav', 'Ishaan', 'Jyoti', 'Karan', 'Kavya',
  'Kritika', 'Lakshmi', 'Madhav', 'Meera', 'Mohit', 'Nandita', 'Neha', 'Nikhil',
  'Nilesh', 'Pooja', 'Pradeep', 'Priya', 'Rahul', 'Raj', 'Rajesh', 'Riya',
  'Rohan', 'Rohit', 'Sakshi', 'Sandeep', 'Sanjay', 'Sapna', 'Sara', 'Shivam',
  'Shreya', 'Simran', 'Sneha', 'Sonu', 'Suresh', 'Sushma', 'Tanvi', 'Tushar',
  'Uday', 'Varun', 'Vidya', 'Vikram', 'Vinay', 'Vinita', 'Vishal', 'Yash', 'Zara',
]

const LAST_NAMES = [
  'Agarwal', 'Bhat', 'Chandra', 'Desai', 'Dubey', 'Ghosh', 'Gupta', 'Iyer',
  'Jain', 'Joshi', 'Kapoor', 'Khanna', 'Kumar', 'Malhotra', 'Mehta', 'Mishra',
  'Nair', 'Panda', 'Pandey', 'Patel', 'Pillai', 'Rao', 'Reddy', 'Saxena',
  'Shah', 'Sharma', 'Singh', 'Sinha', 'Trivedi', 'Varma', 'Verma',
]

export function generateDemoParticipants(): Participant[] {
  const rng = seededRandom(42)
  const participants: Participant[] = []
  const usedPhones = new Set<string>()

  for (let i = 1; i <= 250; i++) {
    const firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)]
    const lastName = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]
    const name = `${firstName} ${lastName} [DEMO]`

    // Generate unique 10-digit phone starting with 9
    let phone: string
    do {
      const suffix = String(Math.floor(rng() * 900_000_000) + 100_000_000)
      phone = `+919${suffix}`
    } while (usedPhones.has(phone))
    usedPhones.add(phone)

    // First 2 accounts are special demo users
    const participantId = generateParticipantId(i)
    const qrToken = `DEMO_${participantId}_${generateToken(16)}`

    // ~40% already collected for demo realism
    const gift_status: 'pending' | 'collected' = rng() < 0.4 ? 'collected' : 'pending'

    participants.push({
      id: `demo-participant-${i}`,
      participant_id: participantId,
      name,
      phone,
      auth_user_id: `demo-user-${i}`,
      qr_token: qrToken,
      gift_status,
      created_at: new Date(Date.now() - Math.floor(rng() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
    })
  }

  // Override first participant with known demo attendee credentials
  participants[0] = {
    ...participants[0],
    id: 'demo-participant-1',
    participant_id: 'GFT-0001',
    name: 'Demo Attendee [DEMO]',
    phone: '+919800000001',
    auth_user_id: 'demo-user-attendee',
    qr_token: 'DEMO_GFT-0001_FIXED_TOKEN_FOR_TESTING',
    gift_status: 'pending',
  }

  return participants
}

export function generateDemoRedemptions(participants: Participant[]): GiftRedemption[] {
  const collected = participants.filter((p) => p.gift_status === 'collected')
  return collected.map((p, i) => ({
    id: `demo-redemption-${i + 1}`,
    participant_id: p.id,
    staff_user_id: 'demo-user-staff',
    redeemed_at: new Date(Date.now() - Math.floor(Math.random() * 4 * 60 * 60 * 1000)).toISOString(),
    participant: p,
  }))
}

export function generateDemoAuditEvents(participants: Participant[]): ScanAuditEvent[] {
  const events: ScanAuditEvent[] = []
  const collected = participants.filter((p) => p.gift_status === 'collected')

  // Successful scans
  collected.slice(0, 20).forEach((p, i) => {
    events.push({
      id: `demo-audit-${i + 1}`,
      staff_user_id: 'demo-user-staff',
      participant_id: p.id,
      result_type: 'success',
      details: 'Gift issued',
      scanned_at: new Date(Date.now() - Math.floor(Math.random() * 3 * 60 * 60 * 1000)).toISOString(),
      participant: p,
    })
  })

  // Some duplicate attempts
  events.push({
    id: 'demo-audit-dup-1',
    staff_user_id: 'demo-user-staff',
    participant_id: collected[0]?.id ?? null,
    result_type: 'already_collected',
    details: 'Duplicate scan attempt',
    scanned_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    participant: collected[0],
  })

  // Some invalid QR attempts
  events.push({
    id: 'demo-audit-invalid-1',
    staff_user_id: 'demo-user-staff',
    participant_id: null,
    result_type: 'invalid_token',
    details: '[redacted]',
    scanned_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  })

  return events.sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime())
}

export interface DemoStore {
  participants: Participant[]
  redemptions: GiftRedemption[]
  auditEvents: ScanAuditEvent[]
  nextParticipantIndex: number
}

const DEMO_STORAGE_KEY = 'giftpass_demo_store'

export function loadDemoStore(): DemoStore {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) as DemoStore
    }
  } catch {
    // Corrupt storage — reset
  }
  return resetDemoStore()
}

export function saveDemoStore(store: DemoStore): void {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(store))
}

export function resetDemoStore(): DemoStore {
  const participants = generateDemoParticipants()
  const redemptions = generateDemoRedemptions(participants)
  const auditEvents = generateDemoAuditEvents(participants)
  const store: DemoStore = {
    participants,
    redemptions,
    auditEvents,
    nextParticipantIndex: 251,
  }
  saveDemoStore(store)
  return store
}
