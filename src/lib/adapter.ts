/**
 * DataAdapter interface — implemented by both the production Supabase adapter
 * and the local demo adapter. No production data ever passes through the demo path.
 */

import type {
  AppSession,
  DashboardStats,
  GiftRedemption,
  ImportResult,
  Participant,
  RedeemResult,
  ScanAuditEvent,
  ScanPreviewResult,
} from '../types'

export interface LoginCredentials {
  phone: string
  password: string
}

export interface AddParticipantInput {
  name: string
  phone: string
}

export interface DataAdapter {
  /** Auth — single login, role determined server-side */
  login(phone: string, password: string): Promise<AppSession>
  logout(): Promise<void>
  getCurrentSession(): Promise<AppSession | null>

  /** Attendee */
  getMyParticipant(userId: string): Promise<Participant>

  /** Staff scanner */
  lookupByToken(token: string): Promise<ScanPreviewResult | null>
  lookupByIdOrName(query: string): Promise<ScanPreviewResult[]>
  redeemGift(token: string, staffUserId: string): Promise<RedeemResult>
  /** Redeem by participant UUID — used for manual-search path (no raw QR token exposed) */
  redeemGiftById(participantId: string, staffUserId: string): Promise<RedeemResult>
  recordScanEvent(
    staffUserId: string,
    participantId: string | null,
    resultType: string,
    details?: string
  ): Promise<void>

  /** Admin */
  getDashboardStats(): Promise<DashboardStats>
  getParticipants(opts: {
    search?: string
    status?: 'all' | 'pending' | 'collected'
    page?: number
    pageSize?: number
  }): Promise<{ data: Participant[]; total: number }>
  getParticipantById(id: string): Promise<Participant | null>
  addParticipant(input: AddParticipantInput): Promise<Participant>
  importParticipants(rows: Array<{ name: string; phone: string }>): Promise<ImportResult>
  getRedemptionHistory(opts: { page?: number; pageSize?: number }): Promise<{
    data: GiftRedemption[]
    total: number
  }>
  getScanAuditEvents(opts: { page?: number; pageSize?: number }): Promise<{
    data: ScanAuditEvent[]
    total: number
  }>
  exportParticipantsCsv(): Promise<string>
}
