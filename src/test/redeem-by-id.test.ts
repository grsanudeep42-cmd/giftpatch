/**
 * Tests for redeemGiftById — the manual-search redemption path.
 *
 * This verifies that:
 *  - A gift can be redeemed by participant UUID (no raw QR token required)
 *  - Double-redemption via UUID returns already_collected
 *  - An unknown UUID returns invalid_token
 *  - Concurrent UUID redemptions produce exactly one success
 *
 * These tests run against the demo adapter (in-memory).
 * The production path calls redeem_gift_by_participant_id() which has identical
 * atomicity guarantees (SELECT … FOR UPDATE + UNIQUE constraint).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDemoStore, loadDemoStore } from '../lib/demo-fixtures'
import { demoAdapter } from '../lib/demo-adapter'

beforeEach(() => {
  resetDemoStore()
})

describe('redeemGiftById — success path', () => {
  it('redeems by participant UUID and marks collected', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!
    expect(pending).toBeDefined()

    const result = await demoAdapter.redeemGiftById(pending.id, 'staff-001')

    expect(result.result).toBe('success')
    expect(result.participant_name).toBe(pending.name)
    expect(result.participant_display_id).toBe(pending.participant_id)
    expect(result.redeemed_at).toBeDefined()

    const updated = loadDemoStore()
    const updatedP = updated.participants.find((p) => p.id === pending.id)!
    expect(updatedP.gift_status).toBe('collected')
  })

  it('creates exactly one redemption record', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!
    const before = loadDemoStore().redemptions.length

    await demoAdapter.redeemGiftById(pending.id, 'staff-001')

    const after = loadDemoStore().redemptions.length
    expect(after).toBe(before + 1)
  })

  it('records a success audit event', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!

    await demoAdapter.redeemGiftById(pending.id, 'staff-001')

    const updated = loadDemoStore()
    const events = updated.auditEvents.filter(
      (e) => e.result_type === 'success' && e.participant_id === pending.id
    )
    expect(events.length).toBeGreaterThanOrEqual(1)
  })
})

describe('redeemGiftById — already collected', () => {
  it('returns already_collected on second call', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!

    const first = await demoAdapter.redeemGiftById(pending.id, 'staff-001')
    expect(first.result).toBe('success')

    const second = await demoAdapter.redeemGiftById(pending.id, 'staff-002')
    expect(second.result).toBe('already_collected')
    expect(second.participant_name).toBe(pending.name)
  })

  it('does not create a second redemption record', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!

    await demoAdapter.redeemGiftById(pending.id, 'staff-001')
    await demoAdapter.redeemGiftById(pending.id, 'staff-002')

    const redemptions = loadDemoStore().redemptions.filter(
      (r) => r.participant_id === pending.id
    )
    expect(redemptions).toHaveLength(1)
  })

  it('returns already_collected for a pre-collected participant', async () => {
    const store = loadDemoStore()
    const collected = store.participants.find((p) => p.gift_status === 'collected')!

    const result = await demoAdapter.redeemGiftById(collected.id, 'staff-001')
    expect(result.result).toBe('already_collected')
  })
})

describe('redeemGiftById — invalid participant', () => {
  it('returns invalid_token for a random UUID', async () => {
    const result = await demoAdapter.redeemGiftById(
      '00000000-0000-0000-0000-000000000000',
      'staff-001'
    )
    expect(result.result).toBe('invalid_token')
  })

  it('does not create a redemption for an unknown UUID', async () => {
    const before = loadDemoStore().redemptions.length
    await demoAdapter.redeemGiftById('00000000-0000-0000-0000-000000000099', 'staff-001')
    const after = loadDemoStore().redemptions.length
    expect(after).toBe(before)
  })
})

describe('redeemGiftById — concurrent simulation', () => {
  /**
   * JS is single-threaded so concurrent Promises are serialised.
   * This verifies logical idempotency: exactly one success, rest already_collected.
   * Production safety comes from SELECT … FOR UPDATE + UNIQUE constraint in the
   * redeem_gift_by_participant_id PostgreSQL function.
   */
  it('exactly one concurrent call succeeds, rest return already_collected', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        demoAdapter.redeemGiftById(pending.id, `staff-00${i}`)
      )
    )

    const successes = results.filter((r) => r.result === 'success')
    const duplicates = results.filter((r) => r.result === 'already_collected')

    expect(successes).toHaveLength(1)
    expect(duplicates).toHaveLength(4)

    const finalRedemptions = loadDemoStore().redemptions.filter(
      (r) => r.participant_id === pending.id
    )
    expect(finalRedemptions).toHaveLength(1)
  })
})

describe('manual vs QR token — cross-path isolation', () => {
  it('a QR redemption then a manual attempt returns already_collected', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!

    // QR path
    const qrResult = await demoAdapter.redeemGift(pending.qr_token, 'staff-001')
    expect(qrResult.result).toBe('success')

    // Manual path on same participant
    const manualResult = await demoAdapter.redeemGiftById(pending.id, 'staff-002')
    expect(manualResult.result).toBe('already_collected')
  })

  it('a manual redemption then a QR attempt returns already_collected', async () => {
    const store = loadDemoStore()
    const pending = store.participants.find((p) => p.gift_status === 'pending')!

    // Manual path
    const manualResult = await demoAdapter.redeemGiftById(pending.id, 'staff-001')
    expect(manualResult.result).toBe('success')

    // QR path on same participant
    const qrResult = await demoAdapter.redeemGift(pending.qr_token, 'staff-002')
    expect(qrResult.result).toBe('already_collected')
  })
})
