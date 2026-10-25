-- Migration 002: Row Level Security policies

-- ─── Enable RLS on all tables ─────────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.participants       enable row level security;
alter table public.gift_redemptions  enable row level security;
alter table public.scan_audit_events enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROFILES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Any authenticated user can read their own profile (to resolve their role)
create policy "profiles: own row read"
  on public.profiles for select
  using (auth.uid() = id);

-- No client may insert or update profiles — only service-role Edge Functions may.
-- (No INSERT/UPDATE/DELETE policies = denied for all authenticated clients.)

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTICIPANTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper: caller role lookup (used in multiple policies)
create or replace function public.caller_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Attendees can read only their own participant record
create policy "participants: attendee reads own"
  on public.participants for select
  using (
    auth.uid() = auth_user_id
    and public.caller_role() = 'attendee'
  );

-- Staff can read participant fields needed for scanning (no phone, no full PII)
-- We expose the whole row to staff/admin via RPC functions; this policy allows
-- the lookup RPC to work under the caller's auth context.
create policy "participants: staff/admin reads all"
  on public.participants for select
  using (public.caller_role() in ('staff','admin'));

-- Admins can insert new participants (via Edge Function that uses service role,
-- but we also allow direct admin inserts through the anon key for flexibility)
create policy "participants: admin insert"
  on public.participants for insert
  with check (public.caller_role() = 'admin');

-- No direct client UPDATE on participants (gift_status is set only by the
-- redeem_gift function running as security definer)

-- ═══════════════════════════════════════════════════════════════════════════════
-- GIFT REDEMPTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Staff and admin can read redemption records
create policy "redemptions: staff/admin reads"
  on public.gift_redemptions for select
  using (public.caller_role() in ('staff','admin'));

-- No direct client INSERT — only the redeem_gift function (security definer) writes here

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCAN AUDIT EVENTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Staff can insert their own audit events
create policy "audit: staff/admin insert"
  on public.scan_audit_events for insert
  with check (
    auth.uid() = staff_user_id
    and public.caller_role() in ('staff','admin')
  );

-- Staff and admin can read audit events
create policy "audit: staff/admin reads"
  on public.scan_audit_events for select
  using (public.caller_role() in ('staff','admin'));
