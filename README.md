# GiftPass — QR Gift Distribution System

A production-oriented event gift distribution application for 250 participants. Three role-based portals — participant, staff scanner, and admin — backed by Supabase Auth + PostgreSQL with atomic, duplicate-safe QR redemption.

## Architecture

```
Browser (React + Vite)
  ├── Attendee Portal    → /attendee/*
  ├── Staff Scanner      → /staff/*
  └── Admin Portal       → /admin/*
       ↓ anon key + RLS
Supabase
  ├── Auth (phone + password)
  ├── PostgreSQL (profiles, participants, gift_redemptions, scan_audit_events)
  ├── RLS policies (role-enforced at DB layer)
  ├── DB Functions (redeem_gift, lookup_participant_by_token, get_dashboard_stats)
  └── Edge Functions (add-participant, import-participants)  ← service-role key here only
```

**Data adapters:** `src/lib/demo-adapter.ts` (localStorage, demo mode) and `src/lib/supabase-adapter.ts` (production). Selected at startup by `VITE_DEMO_MODE`. The build fails if `VITE_DEMO_MODE=true` in production.

## Quick Start (Demo Mode)

```bash
cp .env.example .env.local
# .env.local already has VITE_DEMO_MODE=true — no Supabase needed

npm install
npm run dev
```

Open `http://localhost:5173` and use the demo credentials shown on the landing page.

**Demo credentials:**

| Role      | Phone       | Password        |
|-----------|-------------|-----------------|
| Attendee  | 9800000001  | Demo@2026       |
| Staff     | 9800000251  | Staff@Demo2026  |
| Admin     | 9800000252  | Admin@Demo2026  |

> **Warning:** Demo mode uses localStorage. Changes are not shared between devices or browser tabs. Do not use demo mode to coordinate redemptions during a real event.

## Environment Variables

| Variable                | Required in Prod | Description                                   |
|-------------------------|------------------|-----------------------------------------------|
| `VITE_SUPABASE_URL`     | ✅               | Supabase project URL (from Dashboard → API)   |
| `VITE_SUPABASE_ANON_KEY`| ✅               | Supabase anon/public key                      |
| `VITE_DEMO_MODE`        | ❌ forbidden     | `true` enables demo — must be absent in prod  |

**Edge Function secrets** (set via `supabase secrets set`):

| Secret                       | Description                                              |
|------------------------------|----------------------------------------------------------|
| `SUPABASE_SERVICE_ROLE_KEY`  | Auto-injected by Supabase runtime                        |
| `EVENT_ACCESS_PASSWORD`      | Shared event password, min 8 chars, never in source code |

## Supabase Setup

### 1. Create a project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Note the **Project URL** and **anon key** from Project Settings → API

### 2. Enable phone authentication

1. Supabase Dashboard → Authentication → Providers
2. Enable **Phone** provider
3. Set **Phone confirmations** OFF (we pre-confirm server-side to avoid SMS)
4. Set a custom SMS provider or use test OTPs if needed for other flows

### 3. Run migrations

```bash
# Option A: Supabase CLI
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# Option B: Paste each migration file into Dashboard → SQL Editor
# Run in order: 001_schema.sql → 002_rls.sql → 003_functions.sql
```

### 4. Deploy Edge Functions

```bash
supabase functions deploy add-participant
supabase functions deploy import-participants
```

### 5. Set Edge Function secrets

```bash
supabase secrets set EVENT_ACCESS_PASSWORD="YourSecurePassword123"
# SUPABASE_SERVICE_ROLE_KEY is auto-injected
```

### 6. Provision admin and staff accounts

Run the following in the Supabase SQL Editor (replace values):

```sql
-- Create admin user (use a real phone the admin will log in from)
-- Step 1: Create auth user via Dashboard → Authentication → Users → Add User
-- OR use the Admin API:

-- After creating the auth user, note their UUID, then:
INSERT INTO public.profiles (id, role) VALUES ('AUTH-USER-UUID-HERE', 'admin');

-- For staff accounts, repeat with role = 'staff'
INSERT INTO public.profiles (id, role) VALUES ('STAFF-USER-UUID-HERE', 'staff');
```

Alternatively, use the Supabase Dashboard:
1. Authentication → Users → Invite / Add User (phone + password)
2. SQL Editor → insert into profiles with their user ID and role

### 7. Import the participant roster

1. Log in to the Admin portal
2. Go to **Import CSV**
3. Upload your CSV file — required columns: `name`, `phone`
4. Preview, then click **Import**

**CSV format example:**
```csv
name,phone
Priya Sharma,9876543210
Arjun Patel,8765432109
```

> To export from Excel: File → Save As → CSV (Comma delimited) (.csv)

## Commands

```bash
npm run dev          # Local dev server (demo mode)
npm run build        # Production build (VITE_DEMO_MODE must be unset)
npm run typecheck    # TypeScript check
npm run test         # Run Vitest tests
npm run test:watch   # Watch mode
npm run preview      # Preview the production build locally
```

## Deployment — Cloudflare Pages

1. Push code to GitHub
2. Cloudflare Pages → Create Project → Connect your repo
3. Build settings:
   - Build command: `npm run build`
   - Build output: `dist`
   - Node version: `22`
4. Environment Variables → Add:
   - `VITE_SUPABASE_URL` = your project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
   - **Do NOT** add `VITE_DEMO_MODE`
5. The `_redirects` file ensures SPA routing works

**Vercel fallback:** `vercel.json` is included. Import the repo in Vercel and set the same two env vars.

## Database Design

### `profiles`
- `id` → auth.users FK, `role` (attendee/staff/admin)
- Never writable by clients; only set server-side

### `participants`
- `participant_id` (GFT-XXXX), `name`, `phone` (unique E.164), `qr_token` (unique opaque hex), `gift_status`
- Attendees read only their own row; staff/admin read all

### `gift_redemptions`
- `participant_id` has a **UNIQUE constraint** — the atomic duplicate-prevention mechanism
- Two concurrent inserts for the same participant result in exactly one success (unique violation caught in `redeem_gift`)

### `scan_audit_events`
- Records every scan: success, duplicate, invalid, error
- Raw invalid tokens are never stored — logged as `[redacted]`

## Security Model

- The **service-role key** lives only in Edge Function secrets. It is never in `VITE_*` variables, source code, or the browser.
- **RLS** enforces role isolation at the database level — hiding frontend buttons is not access control.
- **`redeem_gift`** runs as `SECURITY DEFINER` and verifies the caller's role inside the function before mutating data.
- Attendee QR tokens contain no PII — only an opaque random hex string.
- Phone numbers are normalised to E.164 on input and never exposed to client-side QR payloads.

## Known Limitations

1. **Demo mode is single-device only.** localStorage is not shared between phones. Do not use it for real event coordination.
2. **Camera QR scanning** requires HTTPS in production (browsers block `getUserMedia` on HTTP). Cloudflare Pages provides HTTPS by default.
3. **Supabase phone auth** requires a configured SMS provider if you need OTP-based login flows (not needed for this app since we use password auth with pre-confirmed accounts).
4. **Realtime** updates use polling (15s interval) rather than Supabase Realtime subscriptions, which avoids WebSocket connection limits on free-tier projects.

## Event-Day Checklist

- [ ] Supabase project is live and all migrations applied
- [ ] Edge Functions deployed and `EVENT_ACCESS_PASSWORD` secret set
- [ ] Admin and staff accounts provisioned and tested
- [ ] Full participant CSV imported and counts verified in dashboard
- [ ] At least one staff member tested the scanner end-to-end
- [ ] Cloudflare Pages build is green and URL is accessible on HTTPS
- [ ] Admin portal open on a laptop showing live dashboard
- [ ] Paper backup list printed (export CSV from admin portal)
- [ ] All staff phones on the same WiFi / mobile data

## Offline / Internet Failure Procedure

If internet fails during the event:

1. Staff stops scanning and holds participants temporarily
2. Use the paper backup list (export CSV before the event) for manual verification
3. Mark redemptions on paper with participant ID and time
4. When internet is restored, manually redeem using the Admin → Participants manual flow
5. Cross-check paper list against dashboard count before closing

> Multi-device offline redemption is NOT safe — it will cause double-redemption. Always restore internet before resuming digital scanning.
