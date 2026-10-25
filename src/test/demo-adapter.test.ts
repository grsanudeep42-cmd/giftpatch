/**
 * Tests for the demo adapter — redemption logic, duplicate prevention,
 * invalid tokens, concurrent attempts, and import.
 *
 * These tests run entirely against the in-memory demo adapter.
 * No Supabase connection is required.
 *
 * NOTE: The equivalent concurrency test for the production adapter (redeem_gift DB
 * function) must be run against a live Supabase instance — see the comment at the
 * bottom of this file. The database uniqueness constraint on gift_redemptions
 * provides the atomic duplicate-prevention guarantee.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetDemoStore, loadDemoStore } from '../lib/demo-fixtures'
import { demoAdapter, resetDemo } from '../lib/demo-adapter'

// Reset demo data before each test so tests are isolated
beforeEach(() => {
  resetDemoStore()
})

// ─── Redemption: success path ────────────────────────────────────────────────

describe('redeemGift — success', () => {
  it('returns success and marks participant collected', async () => {
    const store = loadDemoStore()
    const pendingParticipant = store.participants.find((p) => p.gift_status === 'pending')!
    expect(pendingParticipant).toBeDefined()

    const result = await demoAdapter.redeemGift(pendingParticipant.qr_token, 'staff-001')

    expect(result.result).toBe('success')
    expect(result.participant_name).toBe(pendingParticipant.name)
    expect(result.redeemed_at).toBeDefined()

    // Verify store updated
    const updated = loadDemoStore()
    const updatedP = updated.participants.find((p) => p.id === pendingParticipant.id)!
    expect(updatedP.gift_status).toBe('collected')
  })

  it('records a redemption entry', async () => {
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!
    const before = loadDemoStore().redemptions.length

    await demoAdapter.redeemGift(participant.qr_token, 'staff-001')

    const after = loadDemoStore().redemptions.length
    expect(after).toBe(before + 1)
  })

  it('records a success audit event', async () => {
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!

    await demoAdapter.redeemGift(participant.qr_token, 'staff-001')

    const updated = loadDemoStore()
    const successEvents = updated.auditEvents.filter(
      (e) => e.result_type === 'success' && e.participant_id === participant.id
    )
    expect(successEvents.length).toBeGreaterThanOrEqual(1)
  })
})

// ─── Redemption: already collected ──────────────────────────────────────────

describe('redeemGift — already collected', () => {
  it('returns already_collected on second redemption attempt', async () => {
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!

    // First redemption
    const first = await demoAdapter.redeemGift(participant.qr_token, 'staff-001')
    expect(first.result).toBe('success')

    // Second attempt on the same token
    const second = await demoAdapter.redeemGift(participant.qr_token, 'staff-002')
    expect(second.result).toBe('already_collected')
    expect(second.participant_name).toBe(participant.name)
  })

  it('does NOT create a second redemption record', async () => {
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!

    await demoAdapter.redeemGift(participant.qr_token, 'staff-001')
    const afterFirst = loadDemoStore().redemptions.filter(
      (r) => r.participant_id === participant.id
    ).length

    await demoAdapter.redeemGift(participant.qr_token, 'staff-002')
    const afterSecond = loadDemoStore().redemptions.filter(
      (r) => r.participant_id === participant.id
    ).length

    expect(afterFirst).toBe(1)
    expect(afterSecond).toBe(1) // No second redemption written
  })

  it('records a duplicate-scan audit event on repeat attempt', async () => {
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!

    await demoAdapter.redeemGift(participant.qr_token, 'staff-001')
    await demoAdapter.redeemGift(participant.qr_token, 'staff-002')

    const updated = loadDemoStore()
    const duplicates = updated.auditEvents.filter(
      (e) => e.result_type === 'already_collected' && e.participant_id === participant.id
    )
    expect(duplicates.length).toBeGreaterThanOrEqual(1)
  })

  it('returns already_collected for a participant that was pre-set collected', async () => {
    const store = loadDemoStore()
    const collected = store.participants.find((p) => p.gift_status === 'collected')!

    const result = await demoAdapter.redeemGift(collected.qr_token, 'staff-001')
    expect(result.result).toBe('already_collected')
  })
})

// ─── Redemption: invalid token ───────────────────────────────────────────────

describe('redeemGift — invalid token', () => {
  it('returns invalid_token for a random string', async () => {
    const result = await demoAdapter.redeemGift('totally-fake-token-xyz', 'staff-001')
    expect(result.result).toBe('invalid_token')
  })

  it('does not create any redemption for an invalid token', async () => {
    const before = loadDemoStore().redemptions.length
    await demoAdapter.redeemGift('bad-token', 'staff-001')
    const after = loadDemoStore().redemptions.length
    expect(after).toBe(before) // unchanged
  })
})

// ─── Concurrent redemption simulation ────────────────────────────────────────

describe('redeemGift — concurrent simulation (demo adapter)', () => {
  /**
   * The demo adapter uses a synchronous localStorage update inside updateStore().
   * Because JS is single-threaded, simulated concurrent calls are actually serialised.
   * This test verifies the logical idempotency: of N "simultaneous" calls, exactly
   * one succeeds and the rest return already_collected.
   *
   * PRODUCTION NOTE:
   * The real concurrent-safety guarantee comes from the PostgreSQL `redeem_gift`
   * function, which uses a UNIQUE constraint on gift_redemptions(participant_id)
   * combined with an INSERT ... ON CONFLICT DO NOTHING pattern inside a single
   * transaction. To validate this against a live Supabase project, run:
   *
   *   npx supabase functions serve
   *   # Then fire N simultaneous redemption requests for the same token and assert
   *   # exactly one 200 OK with result='success' and the rest return 'already_collected'.
   */
  it('exactly one concurrent call succeeds, rest return already_collected', async () => {
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!

    // Fire 5 "simultaneous" calls
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        demoAdapter.redeemGift(participant.qr_token, `staff-00${i}`)
      )
    )

    const successes = results.filter((r) => r.result === 'success')
    const duplicates = results.filter((r) => r.result === 'already_collected')

    expect(successes).toHaveLength(1)
    expect(duplicates).toHaveLength(4)

    // Only one redemption record
    const finalRedemptions = loadDemoStore().redemptions.filter(
      (r) => r.participant_id === participant.id
    )
    expect(finalRedemptions).toHaveLength(1)
  })
})

// ─── Token lookup ─────────────────────────────────────────────────────────────

describe('lookupByToken', () => {
  it('returns participant data for a valid token', async () => {
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!

    const result = await demoAdapter.lookupByToken(participant.qr_token)
    expect(result).not.toBeNull()
    expect(result!.name).toBe(participant.name)
    expect(result!.participant_display_id).toBe(participant.participant_id)
    expect(result!.gift_status).toBe('pending')
  })

  it('returns null for an unknown token', async () => {
    const result = await demoAdapter.lookupByToken('unknown-token')
    expect(result).toBeNull()
  })
})

// ─── Manual lookup ────────────────────────────────────────────────────────────

describe('lookupByIdOrName', () => {
  it('finds participants by participant ID prefix', async () => {
    const results = await demoAdapter.lookupByIdOrName('GFT-0001')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].participant_display_id).toBe('GFT-0001')
  })

  it('finds participants by name substring', async () => {
    const store = loadDemoStore()
    const participant = store.participants[0]
    // Use first word of name
    const namePart = participant.name.split(' ')[0]
    const results = await demoAdapter.lookupByIdOrName(namePart)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('returns empty array for no match', async () => {
    const results = await demoAdapter.lookupByIdOrName('ZZZZNOTEXIST')
    expect(results).toHaveLength(0)
  })
})

// ─── Add participant ──────────────────────────────────────────────────────────

describe('addParticipant', () => {
  it('creates a new participant with generated ID and QR token', async () => {
    const participant = await demoAdapter.addParticipant({
      name: 'Test User',
      phone: '+919500000001',
    })

    expect(participant.participant_id).toMatch(/^GFT-/)
    expect(participant.qr_token).toBeDefined()
    expect(participant.gift_status).toBe('pending')
    expect(participant.phone).toBe('+919500000001')
  })

  it('rejects a duplicate phone number', async () => {
    // Use a phone that already exists in fixtures
    const store = loadDemoStore()
    const existing = store.participants[0]

    await expect(
      demoAdapter.addParticipant({ name: 'Duplicate', phone: existing.phone })
    ).rejects.toThrow(/already exists/)
  })
})

// ─── Import ───────────────────────────────────────────────────────────────────

describe('importParticipants', () => {
  it('imports valid rows and skips duplicates', async () => {
    const store = loadDemoStore()
    const existingPhone = store.participants[0].phone // already in store

    const result = await demoAdapter.importParticipants([
      { name: 'New Person A', phone: '+919100000001' },
      { name: 'New Person B', phone: '+919100000002' },
      { name: 'Duplicate Person', phone: existingPhone },
      { name: '', phone: '+919100000003' }, // missing name
    ])

    expect(result.imported).toBe(2)
    expect(result.skipped).toBe(1)  // duplicate phone
    expect(result.failed).toBe(1)   // missing name
    expect(result.rows).toHaveLength(4)
  })

  it('returns per-row details', async () => {
    const result = await demoAdapter.importParticipants([
      { name: 'Valid User', phone: '+919200000001' },
      { name: 'Bad Phone', phone: 'not-a-phone' },
    ])

    const successRow = result.rows.find((r) => r.status === 'success')
    const errorRow = result.rows.find((r) => r.status === 'error')
    expect(successRow).toBeDefined()
    expect(successRow!.participant_id).toMatch(/^GFT-/)
    expect(errorRow).toBeDefined()
    expect(errorRow!.message).toBeTruthy()
  })
})

// ─── Dashboard stats ──────────────────────────────────────────────────────────

describe('getDashboardStats', () => {
  it('returns correct total, collected, pending', async () => {
    const store = loadDemoStore()
    const expectedCollected = store.participants.filter((p) => p.gift_status === 'collected').length
    const expectedPending = store.participants.filter((p) => p.gift_status === 'pending').length

    const stats = await demoAdapter.getDashboardStats()

    expect(stats.total).toBe(250)
    expect(stats.collected).toBe(expectedCollected)
    expect(stats.pending).toBe(expectedPending)
    expect(stats.collected + stats.pending).toBe(stats.total)
  })

  it('updates stats after a redemption', async () => {
    const before = await demoAdapter.getDashboardStats()
    const store = loadDemoStore()
    const participant = store.participants.find((p) => p.gift_status === 'pending')!

    await demoAdapter.redeemGift(participant.qr_token, 'staff-001')

    const after = await demoAdapter.getDashboardStats()
    expect(after.collected).toBe(before.collected + 1)
    expect(after.pending).toBe(before.pending - 1)
  })
})
