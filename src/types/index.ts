// Core domain types for GiftPass

export type UserRole = 'attendee' | 'staff' | 'admin'

export type GiftStatus = 'pending' | 'collected'

export type ScanResultType = 'success' | 'already_collected' | 'invalid_token' | 'error'

export interface Profile {
  id: string
  role: UserRole
  created_at: string
}

export interface Participant {
  id: string // UUID
  participant_id: string // GFT-0001 format
  name: string
  phone: string // E.164 normalised
  auth_user_id: string | null
  qr_token: string // opaque, cryptographically random
  gift_status: GiftStatus
  created_at: string
}

export interface GiftRedemption {
  id: string
  participant_id: string
  staff_user_id: string
  redeemed_at: string
  participant?: Participant
  staff_profile?: Profile
}

export interface ScanAuditEvent {
  id: string
  staff_user_id: string
  participant_id: string | null
  result_type: ScanResultType
  details: string | null
  scanned_at: string
  participant?: Participant
}

export interface DashboardStats {
  total: number
  collected: number
  pending: number
  percent_collected: number
  duplicate_scan_attempts: number
  invalid_qr_attempts: number
}

export interface ScanPreviewResult {
  participant_id: string   // UUID — used internally for manual redemption
  name: string
  participant_display_id: string
  gift_status: GiftStatus
  redeemed_at?: string
}

export interface RedeemResult {
  result: 'success' | 'already_collected' | 'invalid_token'
  participant_name?: string
  participant_display_id?: string
  redeemed_at?: string
  message: string
}

export interface ImportRow {
  row: number
  name: string
  phone: string
  status: 'success' | 'error' | 'duplicate'
  message?: string
  participant_id?: string
}

export interface ImportResult {
  imported: number
  skipped: number
  failed: number
  rows: ImportRow[]
}

export interface AuthUser {
  id: string
  phone: string
}

export interface StaffMember {
  id: string
  name: string
  phone: string
  email?: string
  created_at: string
}

export interface AppSession {
  user: AuthUser
  role: UserRole
  participant?: Participant
}
