-- Migration 003: Database functions (RPC endpoints)

-- ═══════════════════════════════════════════════════════════════════════════════
-- lookup_participant_by_token
-- Returns minimal participant info for the scan-preview step.
-- Callable by authenticated staff/admin; returns nothing to attendees.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.lookup_participant_by_token(p_token text)
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
begin
  -- Verify caller is staff or admin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('staff','admin') then
    raise exception 'Unauthorised: staff or admin role required';
  end if;

  return query
    select
      p.id,
      p.name,
      p.participant_id,
      p.gift_status,
      r.redeemed_at
    from public.participants p
    left join public.gift_redemptions r on r.participant_id = p.id
    where p.qr_token = p_token
    limit 1;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- redeem_gift
-- Atomically redeems a gift by QR token.
-- Uses UNIQUE constraint on gift_redemptions(participant_id) to prevent
-- concurrent double-redemption: two simultaneous calls result in one INSERT
-- succeeding and one getting a unique-violation that is caught and reported
-- as already_collected.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.redeem_gift(p_token text)
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

  -- Look up the participant
  select * into v_participant
  from public.participants
  where qr_token = p_token
  for update;  -- Lock the row to serialise concurrent calls on same token

  if not found then
    -- Log invalid token attempt (no raw token stored)
    insert into public.scan_audit_events
      (staff_user_id, participant_id, result_type, details)
    values
      (auth.uid(), null, 'invalid_token', '[redacted]');

    return jsonb_build_object(
      'result', 'invalid_token',
      'message', 'QR code not recognised.'
    );
  end if;

  -- Check if already collected (also covers UNIQUE violation path)
  if v_participant.gift_status = 'collected' then
    select redeemed_at into v_existing_at
    from public.gift_redemptions
    where participant_id = v_participant.id;

    insert into public.scan_audit_events
      (staff_user_id, participant_id, result_type, details)
    values
      (auth.uid(), v_participant.id, 'already_collected', 'Duplicate scan attempt');

    return jsonb_build_object(
      'result',                   'already_collected',
      'participant_name',         v_participant.name,
      'participant_display_id',   v_participant.participant_id,
      'redeemed_at',              v_existing_at,
      'message',                  'Gift was already collected.'
    );
  end if;

  -- Atomically insert redemption and update participant status
  v_redeemed_at := now();

  begin
    insert into public.gift_redemptions
      (participant_id, staff_user_id, redeemed_at)
    values
      (v_participant.id, auth.uid(), v_redeemed_at);
  exception when unique_violation then
    -- Race condition: another session redeemed first
    select redeemed_at into v_existing_at
    from public.gift_redemptions
    where participant_id = v_participant.id;

    insert into public.scan_audit_events
      (staff_user_id, participant_id, result_type, details)
    values
      (auth.uid(), v_participant.id, 'already_collected', 'Concurrent redemption detected');

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

  -- Audit event: success
  insert into public.scan_audit_events
    (staff_user_id, participant_id, result_type, details)
  values
    (auth.uid(), v_participant.id, 'success', 'Gift issued');

  return jsonb_build_object(
    'result',                   'success',
    'participant_name',         v_participant.name,
    'participant_display_id',   v_participant.participant_id,
    'redeemed_at',              v_redeemed_at,
    'message',                  'Gift successfully issued.'
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- get_dashboard_stats
-- Returns aggregated statistics. Only accessible to admins.
-- ═══════════════════════════════════════════════════════════════════════════════
create or replace function public.get_dashboard_stats()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_role        text;
  v_total       int;
  v_collected   int;
  v_pending     int;
  v_duplicates  int;
  v_invalid     int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin') then
    raise exception 'Unauthorised: admin role required';
  end if;

  select count(*) into v_total from public.participants;
  select count(*) into v_collected from public.participants where gift_status = 'collected';
  select count(*) into v_pending from public.participants where gift_status = 'pending';
  select count(*) into v_duplicates from public.scan_audit_events where result_type = 'already_collected';
  select count(*) into v_invalid from public.scan_audit_events where result_type = 'invalid_token';

  return jsonb_build_object(
    'total',                    v_total,
    'collected',                v_collected,
    'pending',                  v_pending,
    'percent_collected',        case when v_total > 0
                                  then round((v_collected::numeric / v_total) * 100)
                                  else 0 end,
    'duplicate_scan_attempts',  v_duplicates,
    'invalid_qr_attempts',      v_invalid
  );
end;
$$;

-- Grant execute to authenticated users (RLS inside functions handles role checks)
grant execute on function public.lookup_participant_by_token(text) to authenticated;
grant execute on function public.redeem_gift(text) to authenticated;
grant execute on function public.get_dashboard_stats() to authenticated;
