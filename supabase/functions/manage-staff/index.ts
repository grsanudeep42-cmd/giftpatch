// Supabase Edge Function: manage-staff
// Privileged operation for Admin: list, add, and remove staff members.

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
  throw new Error(`Invalid phone number: "${raw}"`)
}

function phoneToEmail(normalised: string): string {
  const digits = normalised.replace(/\D/g, '')
  return `p${digits}@giftpass.event`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify caller is admin
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let body: any = {}
    if (req.method === 'POST') {
      try {
        body = await req.json()
      } catch {
        body = {}
      }
    }

    const action = body.action || (req.method === 'GET' ? 'list' : 'list')

    if (action === 'list') {
      // Fetch all profiles with role = 'staff'
      const { data: staffProfiles, error: pErr } = await adminClient
        .from('profiles')
        .select('id, created_at')
        .eq('role', 'staff')

      if (pErr) throw pErr

      const staffIds = new Set((staffProfiles || []).map((p: any) => p.id))
      const { data: usersData, error: uErr } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      if (uErr) throw uErr

      const staffUsers = (usersData.users || [])
        .filter((u: any) => staffIds.has(u.id))
        .map((u: any) => {
          const prof = staffProfiles.find((p: any) => p.id === u.id)
          return {
            id: u.id,
            name: u.user_metadata?.name || 'Staff Member',
            phone: u.user_metadata?.phone || u.phone || (u.email ? u.email.replace(/@.*/, '').replace(/^p/, '+') : ''),
            email: u.email,
            created_at: prof?.created_at || u.created_at,
          }
        })

      return new Response(JSON.stringify({ staff: staffUsers }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'create') {
      const { name, phone, password } = body
      if (!name?.trim()) {
        return new Response(JSON.stringify({ error: 'Staff name is required.' }), { status: 400, headers: CORS_HEADERS })
      }

      let normalisedPhone: string
      try {
        normalisedPhone = normaliseIndianPhone(phone)
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid phone number.' }), { status: 400, headers: CORS_HEADERS })
      }

      const email = phoneToEmail(normalisedPhone)
      const staffPassword = password?.trim() || 'Staff@2026'

      if (staffPassword.length < 6) {
        return new Response(JSON.stringify({ error: 'Password must be at least 6 characters.' }), { status: 400, headers: CORS_HEADERS })
      }

      // Check if user already exists
      const { data: usersData } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      const existing = usersData?.users?.find((u: any) => u.email === email)

      let staffUserId: string
      if (existing) {
        staffUserId = existing.id
        await adminClient.auth.admin.updateUserById(staffUserId, {
          password: staffPassword,
          user_metadata: { name: name.trim(), phone: normalisedPhone },
        })
      } else {
        const { data: newAuth, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password: staffPassword,
          email_confirm: true,
          user_metadata: { name: name.trim(), phone: normalisedPhone },
        })
        if (createErr) throw createErr
        staffUserId = newAuth.user.id
      }

      // Upsert profile as staff
      const { error: profErr } = await adminClient.from('profiles').upsert({
        id: staffUserId,
        role: 'staff',
      })
      if (profErr) throw profErr

      return new Response(
        JSON.stringify({
          staff: {
            id: staffUserId,
            name: name.trim(),
            phone: normalisedPhone,
            email,
            created_at: new Date().toISOString(),
          },
        }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) {
        return new Response(JSON.stringify({ error: 'Staff ID is required.' }), { status: 400, headers: CORS_HEADERS })
      }
      if (id === user.id) {
        return new Response(JSON.stringify({ error: 'Cannot delete your own admin account.' }), { status: 400, headers: CORS_HEADERS })
      }

      // 1. Delete from profiles (instantly revokes all DB/RPC permissions and app login)
      const { error: profErr } = await adminClient.from('profiles').delete().eq('id', id)
      if (profErr) throw profErr

      // 2. Ban user in auth so they cannot authenticate at all
      await adminClient.auth.admin.updateUserById(id, {
        ban_duration: '876000h',
      })

      // 3. Try to hard-delete from auth.users (works if no scan_audit_events/gift_redemptions FK exists)
      const { error: delErr } = await adminClient.auth.admin.deleteUser(id, false)
      if (delErr) {
        // If there are foreign keys, user is banned and profile deleted, which fully revokes access
        console.warn('Soft-banned due to audit foreign keys:', delErr.message)
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: CORS_HEADERS })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
