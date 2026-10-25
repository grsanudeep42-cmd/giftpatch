-- Migration 004: Security hardening
-- Fixes:
--   1. Add redeem_gift_by_participant_id() for manual-search redemption path
--      (staff can select a participant by name/ID without ever seeing the raw qr_token)
--   2. Revoke staff direct SELECT on participants.qr_token via column-level deny
--      (Supabase RLS does not support column-level DENY; instead we drop the
--       broad staff/admin table-level read policy and replace it with an RPC-only
--       access pattern — staff uses RPCs exclusively, admin uses a safe view)
--   3. Add a sequence for participant display IDs to prevent race conditions
--      in concurrent Edge Function calls
--   4. Add lookup_by_id_or_name() RPC for staff manual search (replaces direct table query)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Participant ID sequence (prevents race in concurrent add/import calls)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create sequence starting after any existing participants
do $$
declare
  v_max int;
begin
  select coalesce(max(
    case when participant_id ~ '^GFT-\d+$'
         then cast(replace(participant_id, 'GFT-', '') as int)
         else 0
    end
  ), 0)
  into v_max
  from public.participants;

  execute format(
    'create sequence if not exists public.participants_display_id_seq start with %s increment by 1 no cycle',
    v_max + 1
  );
end;
$$;

grant usage on sequence public.participants_display_id_seq to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Drop the overly-broad staff/admin participants SELECT policy
--    and replace it with RPC-only access for staff
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the policy that lets staff/admin read the entire participants row (including qr_token)
drop policy if exists "participants: staff/admin reads all" on public.participants;

-- Admin still needs direct table access for the management UI (participants list, export).
-- We create a separate admin-only policy.
-- Staff access is now RPC-only (lookup_participant_by_token, lookup_by_id_or_name, redeem_gift_by_participant_id).
create policy "participants: admin reads all"
  on public.participants for select
  using (public.caller_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. lookup_by_id_or_name — staff-safe participant search
--    Returns only the fields needed to verify and redeem; never returns qr_token.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.lookup_by_id_or_name(p_query text)
returns table (
  participant_id       uuid,
  name                 text,
  participant_display_id text,
  gift_status          text,
  redeemed_at          timestamptz
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
  v_pattern text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('staff','admin') then
    raise exception 'Unauthorised: staff or admin role required';
  end if;

  v_pattern := '%' || p_query || '%';

  return query
    select
      p.id,
      p.name,
      p.participant_id,
      p.gift_status,
      r.redeemed_at
    from public.participants p
    left join public.gift_redemptions r on r.participant_id = p.id
    where p.participant_id ilike v_pattern
       or p.name ilike v_pattern
    order by p.participant_id
    limit 10;
end;
$$;

grant execute on function public.lookup_by_id_or_name(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. redeem_gift_by_participant_id — atomic redemption by participant UUID
--    Used for manual-search redemption flow (no raw QR token required).
--    Identical atomicity guarantees as redeem_gift(token).
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.redeem_gift_by_participant_id(p_participant_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_role          text;
  v_participant   public.participants%rowtype;
  v_redeemed_at   timestamptz;
  v_existing_at   timestamptz;
begin
  -- Verify caller is staff or admin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('staff','admin') then
    raise exception 'Unauthorised: staff or admin role required';
  end if;

  -- Lock the row to serialise concurrent calls for the same participant
  select * into v_participant
  from public.participants
  where id = p_participant_id
  for update;

  if not found then
    insert into public.scan_audit_events
      (staff_user_id, participant_id, result_type, details)
    values
      (auth.uid(), null, 'invalid_token', '[redacted — participant not found]');

    return jsonb_build_object(
      'result',  'invalid_token',
      'message', 'Participant not found.'
    );
  end if;

  -- Check if already collected
  if v_participant.gift_status = 'collected' then
    select redeemed_at into v_existing_at
    from public.gift_redemptions
    where participant_id = v_participant.id;

    insert into public.scan_audit_events
      (staff_user_id, participant_id, result_type, details)
    values
      (auth.uid(), v_participant.id, 'already_collected', 'Duplicate manual redemption attempt');

    return jsonb_build_object(
      'result',                   'already_collected',
      'participant_name',         v_participant.name,
      'participant_display_id',   v_participant.participant_id,
      'redeemed_at',              v_existing_at,
      'message',                  'Gift was already collected.'
    );
  end if;

  -- Atomically insert redemption
  v_redeemed_at := now();

  begin
    insert into public.gift_redemptions
      (participant_id, staff_user_id, redeemed_at)
    values
      (v_participant.id, auth.uid(), v_redeemed_at);
  exception when unique_violation then
    select redeemed_at into v_existing_at
    from public.gift_redemptions
    where participant_id = v_participant.id;

    insert into public.scan_audit_events
      (staff_user_id, participant_id, result_type, details)
    values
      (auth.uid(), v_participant.id, 'already_collected', 'Concurrent manual redemption detected');

    return jsonb_build_object(
      'result',                   'already_collected',
      'participant_name',         v_participant.name,
      'participant_display_id',   v_participant.participant_id,
      'redeemed_at',              v_existing_at,
      'message',                  'Gift was already collected (concurrent scan).'
    );
  end;

  -- Update participant status
  update public.participants
  set gift_status = 'collected'
  where id = v_participant.id;

  -- Audit: success
  insert into public.scan_audit_events
    (staff_user_id, participant_id, result_type, details)
  values
    (auth.uid(), v_participant.id, 'success', 'Gift issued (manual search)');

  return jsonb_build_object(
    'result',                   'success',
    'participant_name',         v_participant.name,
    'participant_display_id',   v_participant.participant_id,
    'redeemed_at',              v_redeemed_at,
    'message',                  'Gift successfully issued.'
  );
end;
$$;

grant execute on function public.redeem_gift_by_participant_id(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. next_participant_display_id() — sequence-based ID allocation
--    Called by Edge Functions instead of ORDER BY created_at DESC LIMIT 1.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.next_participant_display_id()
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text;
  v_num  bigint;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin') then
    raise exception 'Unauthorised: admin role required';
  end if;

  select nextval('public.participants_display_id_seq') into v_num;
  return 'GFT-' || lpad(v_num::text, 4, '0');
end;
$$;

grant execute on function public.next_participant_display_id() to authenticated;
