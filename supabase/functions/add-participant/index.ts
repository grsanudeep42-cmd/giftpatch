// Supabase Edge Function: add-participant
// Privileged operation — creates an auth user + participant record.
// Verifies the caller is an admin before proceeding.
// The service-role key is accessed only here, server-side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normaliseIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`
  throw new Error(`Invalid phone number: "${raw}"`)
}

/** Derive deterministic email from normalised E.164 phone — avoids SMS provider requirement */
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
        JSON.stringify({ error: 'EVENT_ACCESS_PASSWORD secret is not configured (min 8 chars).' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the calling user's JWT and role
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: CORS_HEADERS })
    }

    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await callerClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), { status: 401, headers: CORS_HEADERS })
    }

    const { data: profile } = await callerClient.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required' }), { status: 403, headers: CORS_HEADERS })
    }

    // Parse input
    const { name, phone } = await req.json()
    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: 'Name is required' }), { status: 400, headers: CORS_HEADERS })
    }

    let normalisedPhone: string
    try {
      normalisedPhone = normaliseIndianPhone(phone)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid phone number' }), { status: 400, headers: CORS_HEADERS })
    }

    // Use service-role client for privileged operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Check for existing phone
    const { data: existing } = await adminClient
      .from('participants')
      .select('id')
      .eq('phone', normalisedPhone)
      .maybeSingle()

    if (existing) {
      return new Response(
        JSON.stringify({ error: `A participant with phone ${normalisedPhone} already exists.` }),
        { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    // Allocate next participant display ID using a sequence (race-safe).
    // The caller's JWT is used so the security definer function can verify the admin role.
    const seqClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: seqData, error: seqErr } = await seqClient.rpc('next_participant_display_id')
    if (seqErr || !seqData) {
      return new Response(
        JSON.stringify({ error: 'Failed to allocate participant ID: ' + (seqErr?.message ?? 'unknown') }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }
    const participantDisplayId: string = seqData

    // Create auth user (email derived from phone, pre-confirmed, no SMS needed)
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email: phoneToEmail(normalisedPhone),
      password: eventPassword,
      email_confirm: true,
      user_metadata: { name: name.trim(), phone: normalisedPhone },
    })

    if (authErr) {
      if (authErr.message?.includes('already been registered')) {
        return new Response(
          JSON.stringify({ error: 'An account with this phone number already exists.' }),
          { status: 409, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const authUserId = authData.user.id

    // Create profile with attendee role
    const { error: profileErr } = await adminClient.from('profiles').insert({
      id: authUserId,
      role: 'attendee',
    })

    if (profileErr) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(authUserId)
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Create participant record
    const qrToken = generateToken(32)
    const { data: participant, error: participantErr } = await adminClient
      .from('participants')
      .insert({
        participant_id: participantDisplayId,
        name: name.trim(),
        phone: normalisedPhone,
        auth_user_id: authUserId,
        qr_token: qrToken,
        gift_status: 'pending',
      })
      .select()
      .single()

    if (participantErr) {
      await adminClient.auth.admin.deleteUser(authUserId)
      return new Response(JSON.stringify({ error: participantErr.message }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ participant }), {
      status: 201,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
