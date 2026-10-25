/**
 * Production Supabase data adapter.
 * Uses Supabase Auth (email+password, email derived from phone) + RLS + Edge Functions.
 * The service-role key is NEVER used here — only the anon key via RLS.
 */

import { supabase } from './supabase'
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
} from '../types'
import { normaliseIndianPhone, phoneToEmail, parseCsv, generateToken } from '../utils'
import { PAGE_SIZE } from '../constants'

async function getRole(userId: string): Promise<'attendee' | 'staff' | 'admin'> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !data) throw new Error('Could not load user profile.')
  return data.role as 'attendee' | 'staff' | 'admin'
}

export const supabaseAdapter: DataAdapter = {
  async login(phone: string, password: string): Promise<AppSession> {
    const normalised = normaliseIndianPhone(phone)
    const email = phoneToEmail(normalised)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.toLowerCase().includes('invalid login credentials')) {
        throw new Error('Incorrect phone number or password.')
      }
      throw new Error(error.message)
    }
    const user = data.user!
    const role = await getRole(user.id)

    const session: AppSession = { user: { id: user.id, phone: normalised }, role }

    if (role === 'attendee') {
      const { data: participant } = await supabase
        .from('participants')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()
      session.participant = participant ?? undefined
    }

    return session
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut()
  },

  async getCurrentSession(): Promise<AppSession | null> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return null
    const user = data.session.user
    try {
      const role = await getRole(user.id)
      // Recover phone from email (p919876543210@giftpass.event → +919876543210)
      const emailLocal = (user.email ?? '').split('@')[0].replace(/^p/, '')
      const phone = emailLocal ? `+${emailLocal}` : ''
      const session: AppSession = { user: { id: user.id, phone }, role }
      if (role === 'attendee') {
        const { data: participant } = await supabase
          .from('participants')
          .select('*')
          .eq('auth_user_id', user.id)
          .single()
        session.participant = participant ?? undefined
      }
      return session
    } catch {
      return null
    }
  },

  async getMyParticipant(userId: string): Promise<Participant> {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('auth_user_id', userId)
      .single()
    if (error || !data) throw new Error('Participant record not found.')
    return data as Participant
  },

  async lookupByToken(token: string): Promise<ScanPreviewResult | null> {
    const { data, error } = await supabase.rpc('lookup_participant_by_token', { p_token: token })
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return null
    const row = data[0]
    return {
      participant_id: row.participant_id,
      name: row.name,
      participant_display_id: row.participant_display_id,
      gift_status: row.gift_status,
      redeemed_at: row.redeemed_at ?? undefined,
    }
  },

  async lookupByIdOrName(query: string): Promise<ScanPreviewResult[]> {
    // Uses the lookup_by_id_or_name RPC (security definer, staff/admin role required).
    // Returns only safe fields — never exposes qr_token or phone.
    const { data, error } = await supabase.rpc('lookup_by_id_or_name', { p_query: query })
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: {
      participant_id: string
      name: string
      participant_display_id: string
      gift_status: string
      redeemed_at: string | null
    }) => ({
      participant_id: row.participant_id,
      name: row.name,
      participant_display_id: row.participant_display_id,
      gift_status: row.gift_status as 'pending' | 'collected',
      redeemed_at: row.redeemed_at ?? undefined,
    }))
  },

  async redeemGiftById(participantId: string, _staffUserId: string): Promise<RedeemResult> {
    const { data, error } = await supabase.rpc('redeem_gift_by_participant_id', {
      p_participant_id: participantId,
    })
    if (error) throw new Error(error.message)
    return data as RedeemResult
  },

  async redeemGift(token: string, _staffUserId: string): Promise<RedeemResult> {
    const { data, error } = await supabase.rpc('redeem_gift', { p_token: token })
    if (error) throw new Error(error.message)
    return data as RedeemResult
  },

  async recordScanEvent(
    staffUserId: string,
    participantId: string | null,
    resultType: string,
    details?: string
  ): Promise<void> {
    await supabase.from('scan_audit_events').insert({
      staff_user_id: staffUserId,
      participant_id: participantId,
      result_type: resultType,
      details: details ?? null,
    })
  },

  async getDashboardStats(): Promise<DashboardStats> {
    const { data, error } = await supabase.rpc('get_dashboard_stats')
    if (error) throw new Error(error.message)
    return data as DashboardStats
  },

  async getParticipants({ search = '', status = 'all', page = 1, pageSize = PAGE_SIZE }) {
    let query = supabase
      .from('participants')
      .select('*', { count: 'exact' })
      .order('participant_id', { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (search) {
      const q = `%${search}%`
      query = query.or(`participant_id.ilike.${q},name.ilike.${q},phone.ilike.${q}`)
    }
    if (status !== 'all') {
      query = query.eq('gift_status', status)
    }

    const { data, error, count } = await query
    if (error) throw new Error(error.message)
    return { data: (data ?? []) as Participant[], total: count ?? 0 }
  },

  async getParticipantById(id: string): Promise<Participant | null> {
    const { data } = await supabase
      .from('participants')
      .select('*')
      .or(`id.eq.${id},participant_id.eq.${id}`)
      .maybeSingle()
    return data as Participant | null
  },

  async addParticipant(input: AddParticipantInput): Promise<Participant> {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/[^\x20-\x7E]/g, '').trim()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Not authenticated.')

    const response = await fetch(`${supabaseUrl}/functions/v1/add-participant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'Failed to add participant.')
    return result.participant as Participant
  },

  async importParticipants(rows): Promise<ImportResult> {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/[^\x20-\x7E]/g, '').trim()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Not authenticated.')

    const response = await fetch(`${supabaseUrl}/functions/v1/import-participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rows }),
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'Import failed.')
    return result as ImportResult
  },

  async getRedemptionHistory({ page = 1, pageSize = PAGE_SIZE }) {
    const { data, error, count } = await supabase
      .from('gift_redemptions')
      .select('*, participant:participants(id,participant_id,name,phone)', { count: 'exact' })
      .order('redeemed_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (error) throw new Error(error.message)
    return { data: (data ?? []) as GiftRedemption[], total: count ?? 0 }
  },

  async getScanAuditEvents({ page = 1, pageSize = PAGE_SIZE }) {
    const { data, error, count } = await supabase
      .from('scan_audit_events')
      .select('*, participant:participants(id,participant_id,name)', { count: 'exact' })
      .order('scanned_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (error) throw new Error(error.message)
    return { data: (data ?? []) as ScanAuditEvent[], total: count ?? 0 }
  },

  async exportParticipantsCsv(): Promise<string> {
    const { data, error } = await supabase
      .from('participants')
      .select('participant_id,name,phone,gift_status')
      .order('participant_id')

    if (error) throw new Error(error.message)

    const { data: redemptions } = await supabase
      .from('gift_redemptions')
      .select('participant_id,redeemed_at,staff_user_id')

    const redemptionMap = new Map((redemptions ?? []).map((r) => [r.participant_id, r]))

    // Sanitize a CSV cell value to prevent formula injection.
    // Values starting with = + - @ are prefixed with a tab to neutralise them.
    const sanitize = (val: string): string => {
      if (val && /^[=+\-@\t\r]/.test(val)) return `\t${val}`
      return val
    }

    const escape = (val: string): string => `"${val.replace(/"/g, '""')}"`

    const headers = ['Participant ID', 'Name', 'Phone', 'Status', 'Redeemed At', 'Staff']
    const rows = (data ?? []).map((p: Partial<Participant>) => {
      const r = redemptionMap.get(p.id ?? '')
      return [
        sanitize(p.participant_id ?? ''),
        escape(sanitize(p.name ?? '')),
        sanitize(p.phone ?? ''),
        p.gift_status ?? '',
        r?.redeemed_at ?? '',
        r?.staff_user_id ?? '',
      ].join(',')
    })

    return [headers.join(','), ...rows].join('\n')
  },
}
