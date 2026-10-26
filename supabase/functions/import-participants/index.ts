// Supabase Edge Function: import-participants
// Bulk participant import — admin only, idempotent (duplicate phones skipped).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normaliseIndianPhone(raw: string): string {
  const parts = String(raw).split(/[,/]/)
  const primary = parts[0].trim()
  const digits = primary.replace(/\D/g, '')

  if (digits.length === 10 || digits.length === 9) {
    return `+91${digits}`
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`
  }
  if (digits.length === 11 && digits.startsWith('974')) {
    return `+${digits}`
  }
  if (primary.startsWith('+') && digits.length >= 9) {
    return `+${digits}`
  }
  if (digits.length >= 10) {
    return `+${digits}`
  }
  throw new Error(`Invalid phone: "${raw}"`)
}

/** Derive deterministic email from normalised E.164 phone */
function phoneToEmail(normalised: string): string {
  const digits = normalised.replace(/\D/g, '')
  return `p${digits}@giftpass.event`
}

function generateToken(bytes = 32): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const eventPassword = Deno.env.get('EVENT_ACCESS_PASSWORD')

    if (!eventPassword || eventPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: 'EVENT_ACCESS_PASSWORD is not configured.' }),
        { status: 500, headers: CORS_HEADERS }
      )
    }

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: CORS_HEADERS })
    }
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await callerClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: CORS_HEADERS })
    const { data: profile } = await callerClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS_HEADERS })
    }

    const { rows } = await req.json() as { rows: Array<{ name: string; phone: string }> }
    if (!rows?.length) {
      return new Response(JSON.stringify({ error: 'No rows provided' }), { status: 400, headers: CORS_HEADERS })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Caller client used to call sequence RPC under admin's JWT
    const seqClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    // Pre-load existing phones for duplicate detection
    const { data: existingPhones } = await adminClient
      .from('participants')
      .select('phone')
    const phoneSet = new Set((existingPhones ?? []).map((p: { phone: string }) => p.phone))

    const result = { imported: 0, skipped: 0, failed: 0, rows: [] as object[] }
    const seenPhonesInBatch = new Set<string>()

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

      if (phoneSet.has(normalised) || seenPhonesInBatch.has(normalised)) {
        result.skipped++
        result.rows.push({ row: rowNum, name, phone, status: 'duplicate', message: 'Phone already exists' })
        continue
      }

      try {
        // Allocate a race-safe participant display ID via sequence
        const { data: seqData, error: seqErr } = await seqClient.rpc('next_participant_display_id')
        if (seqErr || !seqData) throw new Error('Failed to allocate participant ID')
        const participantDisplayId: string = seqData

        // Create auth user (email derived from phone, no SMS needed)
        let authUserId: string
        const userEmail = phoneToEmail(normalised)
        const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
          email: userEmail,
          password: eventPassword,
          email_confirm: true,
          user_metadata: { name: name.trim(), phone: normalised },
        })

        if (authErr) {
          if (authErr.message.toLowerCase().includes('already') || authErr.message.toLowerCase().includes('exists')) {
            const { data: usersData } = await adminClient.auth.admin.listUsers()
            const existingUser = usersData?.users?.find((u: { email?: string }) => u.email === userEmail)
            if (existingUser) {
              authUserId = existingUser.id
            } else {
              throw new Error(authErr.message)
            }
          } else {
            throw new Error(authErr.message)
          }
        } else {
          authUserId = authData.user.id
          // Create profile if not already present
          await adminClient.from('profiles').upsert(
            { id: authUserId, role: 'attendee' },
            { onConflict: 'id', ignoreDuplicates: true }
          )
        }

        const qrToken = generateToken(32)

        // Create participant
        const { error: pErr } = await adminClient.from('participants').insert({
          participant_id: participantDisplayId,
          name: name.trim(),
          phone: normalised,
          auth_user_id: authUserId,
          qr_token: qrToken,
          gift_status: 'pending',
        })
        if (pErr) {
          if (!authErr) {
            await adminClient.auth.admin.deleteUser(authUserId)
          }
          throw new Error(pErr.message)
        }

        seenPhonesInBatch.add(normalised)
        phoneSet.add(normalised)
        result.imported++
        result.rows.push({ row: rowNum, name, phone, status: 'success', participant_id: participantDisplayId })
      } catch (err) {
        result.failed++
        result.rows.push({ row: rowNum, name, phone, status: 'error', message: String(err) })
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
