/**
 * Demo data adapter — in-memory + localStorage persistence.
 * NEVER sends data to Supabase. Only active when VITE_DEMO_MODE=true.
 * Must not be imported in production builds.
 */

import type { DataAdapter, AddParticipantInput } from './adapter'
import type {
  AppSession,
  DashboardStats,
  GiftRedemption,
  ImportResult,
  Participant,
  RedeemResult,
  ScanAuditEvent,
  ScanPreviewResult,
  StaffMember,
} from '../types'
import {
  loadDemoStore,
  saveDemoStore,
  resetDemoStore,
  type DemoStore,
} from './demo-fixtures'
import {
  normaliseIndianPhone,
  generateParticipantId,
  generateToken,
  parseCsv,
} from '../utils'
import {
  DEMO_ATTENDEE_PHONE,
  DEMO_ATTENDEE_PASSWORD,
  DEMO_STAFF_PHONE,
  DEMO_STAFF_PASSWORD,
  DEMO_ADMIN_PHONE,
  DEMO_ADMIN_PASSWORD,
  PAGE_SIZE,
} from '../constants'

// Simulated session storage (in-memory for the demo session)
let _session: AppSession | null = null

function getStore(): DemoStore {
  return loadDemoStore()
}

function updateStore(updater: (store: DemoStore) => DemoStore): DemoStore {
  const store = getStore()
  const updated = updater(store)
  saveDemoStore(updated)
  return updated
}

function delay(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const demoAdapter: DataAdapter = {
  async login(phone: string, password: string): Promise<AppSession> {
    await delay()
    const normalised = normaliseIndianPhone(phone)

    const staffPhone = normaliseIndianPhone(DEMO_STAFF_PHONE)
    const adminPhone = normaliseIndianPhone(DEMO_ADMIN_PHONE)

    // Staff login
    if (normalised === staffPhone) {
      if (password !== DEMO_STAFF_PASSWORD) throw new Error('Incorrect password.')
      const session: AppSession = { user: { id: 'demo-user-staff', phone: normalised }, role: 'staff' }
      _session = session
      return session
    }

    // Admin login
    if (normalised === adminPhone) {
      if (password !== DEMO_ADMIN_PASSWORD) throw new Error('Incorrect password.')
      const session: AppSession = { user: { id: 'demo-user-admin', phone: normalised }, role: 'admin' }
      _session = session
      return session
    }

    // Attendee login — look up participant by phone
    const store = getStore()
    const participant = store.participants.find((p) => p.phone === normalised)
    if (!participant) throw new Error('No account found for this phone number.')
    if (password !== DEMO_ATTENDEE_PASSWORD) throw new Error('Incorrect password.')

    const session: AppSession = {
      user: { id: participant.auth_user_id!, phone: normalised },
      role: 'attendee',
      participant,
    }
    _session = session
    return session
  },

  async logout(): Promise<void> {
    await delay(100)
    _session = null
  },

  async getCurrentSession(): Promise<AppSession | null> {
    return _session
  },

  async getMyParticipant(userId: string): Promise<Participant> {
    await delay()
    const store = getStore()
    const participant = store.participants.find((p) => p.auth_user_id === userId)
    if (!participant) {
      throw new Error('Participant record not found.')
    }
    return participant
  },

  async lookupByToken(token: string): Promise<ScanPreviewResult | null> {
    await delay()
    const store = getStore()
    const participant = store.participants.find((p) => p.qr_token === token)
    if (!participant) return null

    const redemption = store.redemptions.find((r) => r.participant_id === participant.id)
    return {
      participant_id: participant.id,
      name: participant.name,
      participant_display_id: participant.participant_id,
      gift_status: participant.gift_status,
      redeemed_at: redemption?.redeemed_at,
    }
  },

  async lookupByIdOrName(query: string): Promise<ScanPreviewResult[]> {
    await delay()
    const store = getStore()
    const q = query.toLowerCase()
    return store.participants
      .filter(
        (p) =>
          p.participant_id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
      )
      .slice(0, 10)
      .map((p) => {
        const redemption = store.redemptions.find((r) => r.participant_id === p.id)
        return {
          participant_id: p.id,
          name: p.name,
          participant_display_id: p.participant_id,
          gift_status: p.gift_status,
          redeemed_at: redemption?.redeemed_at,
        }
      })
  },

  async redeemGift(token: string, staffUserId: string): Promise<RedeemResult> {
    await delay(600)

    // Atomically update store
    let result: RedeemResult = { result: 'invalid_token', message: 'Invalid QR code.' }

    updateStore((store) => {
      const participantIdx = store.participants.findIndex((p) => p.qr_token === token)

      if (participantIdx === -1) {
        result = { result: 'invalid_token', message: 'Invalid QR code. Token not found.' }
        return store
      }

      const participant = store.participants[participantIdx]

      if (participant.gift_status === 'collected') {
        const redemption = store.redemptions.find((r) => r.participant_id === participant.id)
        result = {
          result: 'already_collected',
          participant_name: participant.name,
          participant_display_id: participant.participant_id,
          redeemed_at: redemption?.redeemed_at,
          message: 'Gift was already collected.',
        }
        // Record duplicate scan audit event
        const auditEvent: ScanAuditEvent = {
          id: `demo-audit-dup-${Date.now()}`,
          staff_user_id: staffUserId,
          participant_id: participant.id,
          result_type: 'already_collected',
          details: 'Duplicate scan attempt',
          scanned_at: new Date().toISOString(),
          participant,
        }
        return {
          ...store,
          auditEvents: [auditEvent, ...store.auditEvents],
        }
      }

      // Redeem
      const redeemedAt = new Date().toISOString()
      const redemption: GiftRedemption = {
        id: `demo-redemption-${Date.now()}`,
        participant_id: participant.id,
        staff_user_id: staffUserId,
        redeemed_at: redeemedAt,
        participant,
      }
      const auditEvent: ScanAuditEvent = {
        id: `demo-audit-success-${Date.now()}`,
        staff_user_id: staffUserId,
        participant_id: participant.id,
        result_type: 'success',
        details: 'Gift issued',
        scanned_at: redeemedAt,
        participant,
      }
      const updatedParticipants = [...store.participants]
      updatedParticipants[participantIdx] = { ...participant, gift_status: 'collected' }

      result = {
        result: 'success',
        participant_name: participant.name,
        participant_display_id: participant.participant_id,
        redeemed_at: redeemedAt,
        message: 'Gift successfully issued.',
      }

      return {
        ...store,
        participants: updatedParticipants,
        redemptions: [redemption, ...store.redemptions],
        auditEvents: [auditEvent, ...store.auditEvents],
      }
    })

    return result
  },

  async redeemGiftById(participantId: string, staffUserId: string): Promise<RedeemResult> {
    await delay(600)

    // Atomically update store by participant UUID (manual-search redemption path)
    let result: RedeemResult = { result: 'invalid_token', message: 'Participant not found.' }

    updateStore((store) => {
      const participantIdx = store.participants.findIndex((p) => p.id === participantId)

      if (participantIdx === -1) {
        result = { result: 'invalid_token', message: 'Participant not found.' }
        return store
      }

      const participant = store.participants[participantIdx]

      if (participant.gift_status === 'collected') {
        const redemption = store.redemptions.find((r) => r.participant_id === participant.id)
        result = {
          result: 'already_collected',
          participant_name: participant.name,
          participant_display_id: participant.participant_id,
          redeemed_at: redemption?.redeemed_at,
          message: 'Gift was already collected.',
        }
        const auditEvent: ScanAuditEvent = {
          id: `demo-audit-dup-${Date.now()}`,
          staff_user_id: staffUserId,
          participant_id: participant.id,
          result_type: 'already_collected',
          details: 'Duplicate manual redemption attempt',
          scanned_at: new Date().toISOString(),
          participant,
        }
        return { ...store, auditEvents: [auditEvent, ...store.auditEvents] }
      }

      // Redeem
      const redeemedAt = new Date().toISOString()
      const redemption: GiftRedemption = {
        id: `demo-redemption-${Date.now()}`,
        participant_id: participant.id,
        staff_user_id: staffUserId,
        redeemed_at: redeemedAt,
        participant,
      }
      const auditEvent: ScanAuditEvent = {
        id: `demo-audit-success-${Date.now()}`,
        staff_user_id: staffUserId,
        participant_id: participant.id,
        result_type: 'success',
        details: 'Gift issued (manual search)',
        scanned_at: redeemedAt,
        participant,
      }
      const updatedParticipants = [...store.participants]
      updatedParticipants[participantIdx] = { ...participant, gift_status: 'collected' }

      result = {
        result: 'success',
        participant_name: participant.name,
        participant_display_id: participant.participant_id,
        redeemed_at: redeemedAt,
        message: 'Gift successfully issued.',
      }

      return {
        ...store,
        participants: updatedParticipants,
        redemptions: [redemption, ...store.redemptions],
        auditEvents: [auditEvent, ...store.auditEvents],
      }
    })

    return result
  },

  async recordScanEvent(
    staffUserId: string,
    participantId: string | null,
    resultType: string,
    details?: string
  ): Promise<void> {
    await delay(100)
    updateStore((store) => {
      const event: ScanAuditEvent = {
        id: `demo-audit-${Date.now()}`,
        staff_user_id: staffUserId,
        participant_id: participantId,
        result_type: resultType as ScanAuditEvent['result_type'],
        details: details ?? null,
        scanned_at: new Date().toISOString(),
      }
      return { ...store, auditEvents: [event, ...store.auditEvents] }
    })
  },

  async getDashboardStats(): Promise<DashboardStats> {
    await delay()
    const store = getStore()
    const total = store.participants.length
    const collected = store.participants.filter((p) => p.gift_status === 'collected').length
    const pending = total - collected
    const duplicates = store.auditEvents.filter((e) => e.result_type === 'already_collected').length
    const invalid = store.auditEvents.filter((e) => e.result_type === 'invalid_token').length

    return {
      total,
      collected,
      pending,
      percent_collected: total > 0 ? Math.round((collected / total) * 100) : 0,
      duplicate_scan_attempts: duplicates,
      invalid_qr_attempts: invalid,
    }
  },

  async getParticipants({ search = '', status = 'all', page = 1, pageSize = PAGE_SIZE }) {
    await delay()
    const store = getStore()
    const q = search.toLowerCase()

    let filtered = store.participants.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.participant_id.toLowerCase().includes(q) ||
        p.phone.includes(q)
      const matchStatus = status === 'all' || p.gift_status === status
      return matchSearch && matchStatus
    })

    const total = filtered.length
    const data = filtered.slice((page - 1) * pageSize, page * pageSize)
    return { data, total }
  },

  async getParticipantById(id: string): Promise<Participant | null> {
    await delay()
    const store = getStore()
    return store.participants.find((p) => p.id === id || p.participant_id === id) ?? null
  },

  async addParticipant({ name, phone }: AddParticipantInput): Promise<Participant> {
    await delay(800)
    const normalised = normaliseIndianPhone(phone)
    const store = getStore()

    const existing = store.participants.find((p) => p.phone === normalised)
    if (existing) {
      throw new Error(`A participant with phone ${normalised} already exists.`)
    }

    const idx = store.nextParticipantIndex
    const newParticipant: Participant = {
      id: `demo-participant-${idx}`,
      participant_id: generateParticipantId(idx),
      name: `${name.trim()} [DEMO]`,
      phone: normalised,
      auth_user_id: `demo-user-${idx}`,
      qr_token: `DEMO_${generateParticipantId(idx)}_${generateToken(16)}`,
      gift_status: 'pending',
      created_at: new Date().toISOString(),
    }

    updateStore((s) => ({
      ...s,
      participants: [...s.participants, newParticipant],
      nextParticipantIndex: s.nextParticipantIndex + 1,
    }))

    return newParticipant
  },

  async importParticipants(rows): Promise<ImportResult> {
    await delay(1000)
    const store = getStore()
    const result: ImportResult = { imported: 0, skipped: 0, failed: 0, rows: [] }
    let nextIdx = store.nextParticipantIndex
    const newParticipants: Participant[] = []
    const usedPhones = new Set(store.participants.map((p) => p.phone))

    for (let i = 0; i < rows.length; i++) {
      const { name, phone } = rows[i]
      const rowNum = i + 1

      if (!name?.trim()) {
        result.failed++
        result.rows.push({ row: rowNum, name, phone, status: 'error', message: 'Name is required' })
        continue
      }

      let normalised: string
      try {
        normalised = normaliseIndianPhone(phone)
      } catch {
        result.failed++
        result.rows.push({ row: rowNum, name, phone, status: 'error', message: 'Invalid phone number' })
        continue
      }

      if (usedPhones.has(normalised)) {
        result.skipped++
        result.rows.push({ row: rowNum, name, phone, status: 'duplicate', message: 'Phone already exists' })
        continue
      }

      usedPhones.add(normalised)
      const newParticipant: Participant = {
        id: `demo-participant-${nextIdx}`,
        participant_id: generateParticipantId(nextIdx),
        name: `${name.trim()} [DEMO]`,
        phone: normalised,
        auth_user_id: `demo-user-${nextIdx}`,
        qr_token: `DEMO_${generateParticipantId(nextIdx)}_${generateToken(16)}`,
        gift_status: 'pending',
        created_at: new Date().toISOString(),
      }
      newParticipants.push(newParticipant)
      result.imported++
      result.rows.push({
        row: rowNum,
        name,
        phone,
        status: 'success',
        participant_id: newParticipant.participant_id,
      })
      nextIdx++
    }

    updateStore((s) => ({
      ...s,
      participants: [...s.participants, ...newParticipants],
      nextParticipantIndex: nextIdx,
    }))

    return result
  },

  async getRedemptionHistory({ page = 1, pageSize = PAGE_SIZE }) {
    await delay()
    const store = getStore()
    const sorted = [...store.redemptions].sort(
      (a, b) => new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime()
    )
    const total = sorted.length
    const data = sorted.slice((page - 1) * pageSize, page * pageSize)
    return { data, total }
  },

  async getScanAuditEvents({ page = 1, pageSize = PAGE_SIZE }) {
    await delay()
    const store = getStore()
    const total = store.auditEvents.length
    const data = store.auditEvents.slice((page - 1) * pageSize, page * pageSize)
    return { data, total }
  },

  async exportParticipantsCsv(): Promise<string> {
    await delay()
    const store = getStore()
    const headers = ['Participant ID', 'Name', 'Phone', 'Status', 'Redeemed At']
    const rows = store.participants.map((p) => {
      const redemption = store.redemptions.find((r) => r.participant_id === p.id)
      return [
        p.participant_id,
        `"${p.name}"`,
        p.phone,
        p.gift_status,
        redemption?.redeemed_at ?? '',
      ].join(',')
    })
    return [headers.join(','), ...rows].join('\n')
  },

  async getStaffList(): Promise<StaffMember[]> {
    await delay()
    return [
      {
        id: 'demo-staff-1',
        name: 'Demo Staff Member',
        phone: DEMO_STAFF_PHONE,
        email: `p91${DEMO_STAFF_PHONE}@giftpass.event`,
        created_at: new Date().toISOString(),
      },
    ]
  },

  async addStaff(input: { name: string; phone: string; password?: string }): Promise<StaffMember> {
    await delay()
    const norm = normaliseIndianPhone(input.phone)
    return {
      id: `demo-staff-${Date.now()}`,
      name: input.name.trim(),
      phone: norm,
      email: `p${norm.replace(/\D/g, '')}@giftpass.event`,
      created_at: new Date().toISOString(),
    }
  },

  async deleteStaff(): Promise<void> {
    await delay()
  },
}

export function resetDemo(): void {
  resetDemoStore()
  _session = null
}
