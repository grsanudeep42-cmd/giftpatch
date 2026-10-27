#!/usr/bin/env node
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();
const supabaseAnonKey = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase configuration in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runLiveTest() {
  console.log('======================================================================');
  console.log('   LIVE MULTI-STAFF & CONCURRENT SCANNING VERIFICATION TEST           ');
  console.log('======================================================================\n');

  // 1. Admin login
  console.log('[Test 1] Admin Authentication...');
  const { data: adminAuth, error: adminErr } = await supabase.auth.signInWithPassword({
    email: 'p919866656855@giftpass.event',
    password: 'Admin@2026'
  });
  if (adminErr) throw new Error('Admin authentication failed: ' + adminErr.message);
  const token = adminAuth.session.access_token;
  console.log('  -> PASS: Admin logged in successfully\n');

  // 2. Fetch staff list via Edge Function
  console.log('[Test 2] Edge Function: List Current Staff...');
  const listRes = await fetch(`${supabaseUrl}/functions/v1/manage-staff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'list' }),
  });
  if (!listRes.ok) throw new Error(`Staff list request failed (${listRes.status}): ${await listRes.text()}`);
  const { staff } = await listRes.json();
  console.log(`  -> PASS: Loaded ${staff.length} active staff member(s)\n`);

  // 3. Create a new staff member via Edge Function
  const testPhone = '9876543288';
  const testPassword = 'Staff@Test2026';
  console.log(`[Test 3] Edge Function: Add New Staff Member (+91${testPhone})...`);
  const createRes = await fetch(`${supabaseUrl}/functions/v1/manage-staff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: 'create',
      name: 'Counter 2 Verification Staff',
      phone: testPhone,
      password: testPassword,
    }),
  });
  if (!createRes.ok) throw new Error(`Add staff request failed: ${await createRes.text()}`);
  const { staff: newStaff } = await createRes.json();
  console.log(`  -> PASS: Created staff "${newStaff.name}" (ID: ${newStaff.id})\n`);

  // 4. Test login as new staff
  console.log('[Test 4] Staff Login & Role Authorization Check...');
  const newStaffClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: staffLogin, error: staffLoginErr } = await newStaffClient.auth.signInWithPassword({
    email: `p91${testPhone}@giftpass.event`,
    password: testPassword,
  });
  if (staffLoginErr) throw new Error('New staff login failed: ' + staffLoginErr.message);

  const { data: profile } = await newStaffClient.from('profiles').select('role').eq('id', staffLogin.user.id).single();
  if (profile?.role !== 'staff') throw new Error(`Expected role 'staff', received '${profile?.role}'`);
  console.log('  -> PASS: Login successful, confirmed role is "staff"\n');

  // 5. Concurrency Race Test
  console.log('[Test 5] SIMULTANEOUS Race Condition Test (2 Staff Scanning Same Token)...');
  const testToken = 'race_test_' + Date.now();
  const { data: tempPart } = await supabase
    .from('participants')
    .insert({
      participant_id: 'GFT-RACE-TEST',
      name: 'Simultaneous Test Participant',
      phone: '+919999988888',
      qr_token: testToken,
      gift_status: 'pending',
    })
    .select()
    .single();

  const staff1Client = createClient(supabaseUrl, supabaseAnonKey);
  await staff1Client.auth.signInWithPassword({
    email: 'p919392420007@giftpass.event',
    password: 'Staff@2026',
  });

  const [res1, res2] = await Promise.all([
    staff1Client.rpc('redeem_gift', { p_token: testToken }),
    newStaffClient.rpc('redeem_gift', { p_token: testToken }),
  ]);

  const outcomes = [res1.data?.result, res2.data?.result];
  console.log(`  -> Staff 1 result: "${res1.data?.result}" (${res1.data?.message})`);
  console.log(`  -> Staff 2 result: "${res2.data?.result}" (${res2.data?.message})`);

  if (!outcomes.includes('success') || !outcomes.includes('already_collected')) {
    throw new Error('Concurrency failure: Expected exactly 1 success and 1 already_collected');
  }
  console.log('  -> PASS: Atomic isolation confirmed — zero duplicate redemptions allowed\n');

  // Clean up test participant
  await supabase.from('scan_audit_events').delete().eq('participant_id', tempPart.id);
  await supabase.from('gift_redemptions').delete().eq('participant_id', tempPart.id);
  await supabase.from('participants').delete().eq('id', tempPart.id);

  // 6. Delete test staff member
  console.log('[Test 6] Edge Function: Remove Staff Member...');
  const delRes = await fetch(`${supabaseUrl}/functions/v1/manage-staff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action: 'delete', id: newStaff.id }),
  });
  if (!delRes.ok) throw new Error(`Staff delete request failed: ${await delRes.text()}`);
  console.log('  -> PASS: Staff access revoked successfully\n');

  // 7. Verify revoked staff is blocked from logging in
  console.log('[Test 7] Verify Revoked Staff Login is Blocked...');
  const blockedClient = createClient(supabaseUrl, supabaseAnonKey);
  const { error: blockedErr } = await blockedClient.auth.signInWithPassword({
    email: `p91${testPhone}@giftpass.event`,
    password: testPassword,
  });
  if (!blockedErr) throw new Error('Security flaw: Revoked staff member was still able to login!');
  console.log(`  -> PASS: Login blocked with message: "${blockedErr.message}"\n`);

  console.log('======================================================================');
  console.log('   ALL 7 LIVE INTEGRATION TESTS PASSED 100%! SYSTEM IS ROCK SOLID.    ');
  console.log('======================================================================');
}

runLiveTest().catch((err) => {
  console.error('\nVerification FAILED:', err);
  process.exit(1);
});
