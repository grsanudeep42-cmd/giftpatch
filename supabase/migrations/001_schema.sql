-- Migration 001: Core schema
-- Run this in the Supabase SQL editor or via `supabase db push`

-- ─── Enable UUID extension ────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── profiles ────────────────────────────────────────────────────────────────
-- Protected role table. Never writable by the client directly.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('attendee','staff','admin')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. Role is set server-side only. Clients cannot promote themselves.';

-- ─── participants ─────────────────────────────────────────────────────────────
create table if not exists public.participants (
  id                uuid primary key default gen_random_uuid(),
  participant_id    text not null unique,           -- GFT-0001
  name              text not null,
  phone             text not null unique,           -- E.164 normalised
  auth_user_id      uuid unique references auth.users(id) on delete set null,
  qr_token          text not null unique,           -- opaque, cryptographically random
  gift_status       text not null default 'pending'
                      check (gift_status in ('pending','collected')),
  created_at        timestamptz not null default now()
);

create index if not exists participants_phone_idx    on public.participants(phone);
create index if not exists participants_qr_token_idx on public.participants(qr_token);
create index if not exists participants_status_idx   on public.participants(gift_status);

comment on column public.participants.qr_token is
  'Random opaque token. Contains no PII. This is what the QR encodes.';

-- ─── gift_redemptions ─────────────────────────────────────────────────────────
-- The UNIQUE constraint on participant_id is the atomic duplicate-prevention mechanism.
-- Two concurrent inserts for the same participant will result in exactly one success.
create table if not exists public.gift_redemptions (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null unique references public.participants(id),
  staff_user_id   uuid not null references auth.users(id),
  redeemed_at     timestamptz not null default now()
);

create index if not exists redemptions_staff_idx     on public.gift_redemptions(staff_user_id);
create index if not exists redemptions_redeemed_idx  on public.gift_redemptions(redeemed_at desc);

-- ─── scan_audit_events ────────────────────────────────────────────────────────
create table if not exists public.scan_audit_events (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references auth.users(id),
  participant_id  uuid references public.participants(id),
  result_type     text not null check (result_type in ('success','already_collected','invalid_token','error')),
  details         text,                             -- safe summary; raw invalid tokens are never stored
  scanned_at      timestamptz not null default now()
);

create index if not exists audit_staff_idx  on public.scan_audit_events(staff_user_id);
create index if not exists audit_time_idx   on public.scan_audit_events(scanned_at desc);
create index if not exists audit_type_idx   on public.scan_audit_events(result_type);
