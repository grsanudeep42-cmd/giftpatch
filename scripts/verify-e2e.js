#!/usr/bin/env node
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();
const supabaseAnonKey = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runVerification() {
  console.log('====================================================');
  console.log('   FULL END-TO-END PROJECT VERIFICATION TEST');
  console.log('====================================================\n');

  // Test 1: Admin Login & Profile
  console.log('[Test 1] Admin Login (Phone: 9866656855)...');
  const adminClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: adminAuth, error: adminErr } = await adminClient.auth.signInWithPassword({
    email: 'p919866656855@giftpass.event',
    password: 'Admin@2026'
  });
  if (adminErr) throw new Error(`Admin login failed: ${adminErr.message}`);
  const { data: adminProfile } = await adminClient.from('profiles').select('*').eq('id', adminAuth.user.id).single();
  if (adminProfile?.role !== 'admin') throw new Error(`Expected admin role, got ${adminProfile?.role}`);
  console.log('  -> PASS: Admin logged in, role verified as "admin"\n');

  // Test 2: Admin Dashboard Stats
  console.log('[Test 2] Admin Dashboard Stats RPC...');
  const { data: stats, error: statsErr } = await adminClient.rpc('get_dashboard_stats');
  if (statsErr) throw new Error(`Dashboard stats failed: ${statsErr.message}`);
  console.log(`  -> Total: ${stats.total}, Pending: ${stats.pending}, Collected: ${stats.collected}, Rate: ${stats.percent_collected ?? stats.collection_rate}%`);
  if (stats.total !== 123 || stats.pending !== 123 || stats.collected !== 0) {
    throw new Error(`Unexpected stats: expected 123 total/pending, got ${JSON.stringify(stats)}`);
  }
  console.log('  -> PASS: Stats match 123 total seeded participants, 123 pending, 0 collected\n');

  // Test 3: Admin Participant Search & Pagination
  console.log('[Test 3] Admin Participant Pagination & Search...');
  const { data: pList, count: pCount } = await adminClient
    .from('participants')
    .select('*', { count: 'exact' })
    .order('participant_id', { ascending: true })
    .range(0, 4);
  console.log(`  -> First 5 participants fetched (Total count: ${pCount}):`);
  pList.forEach(p => console.log(`     ${p.participant_id}: ${p.name} (${p.phone}) [${p.gift_status}]`));
  if (pCount !== 123 || pList[0].participant_id !== 'GFT-0001') {
    throw new Error('Participant list pagination failed');
  }

  // Search test
  const { data: searchResults } = await adminClient
    .from('participants')
    .select('*')
    .ilike('name', '%Jagadeeswara%');
  if (!searchResults?.length || searchResults[0].participant_id !== 'GFT-0001') {
    throw new Error('Participant search failed');
  }
  console.log(`  -> PASS: Participant list & search verified\n`);

  // Test 4: Staff Login
  console.log('[Test 4] Staff Login (Phone: 9392420007)...');
  const staffClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: staffAuth, error: staffErr } = await staffClient.auth.signInWithPassword({
    email: 'p919392420007@giftpass.event',
    password: 'Staff@2026'
  });
  if (staffErr) throw new Error(`Staff login failed: ${staffErr.message}`);
  const { data: staffProfile } = await staffClient.from('profiles').select('*').eq('id', staffAuth.user.id).single();
  if (staffProfile?.role !== 'staff') throw new Error(`Expected staff role, got ${staffProfile?.role}`);
  console.log('  -> PASS: Staff logged in, role verified as "staff"\n');

  // Test 5: Attendee Login & Pass Retrieval
  console.log('[Test 5] Attendee Login (Phone: 9848776289)...');
  const attendeeClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: attendeeAuth, error: attErr } = await attendeeClient.auth.signInWithPassword({
    email: 'p919848776289@giftpass.event',
    password: 'Gift@2026'
  });
  if (attErr) throw new Error(`Attendee login failed: ${attErr.message}`);
  const { data: myParticipant, error: myPErr } = await attendeeClient
    .from('participants')
    .select('*')
    .eq('auth_user_id', attendeeAuth.user.id)
    .single();
  if (myPErr || !myParticipant) throw new Error('Attendee could not retrieve their own participant pass');
  console.log(`  -> Retrieved Pass: ${myParticipant.participant_id} - ${myParticipant.name}`);
  console.log(`  -> QR Token (64-char): ${myParticipant.qr_token.substring(0, 16)}...`);
  console.log('  -> PASS: Attendee successfully logged in and fetched their pass\n');

  // Test 6: RLS Security Check (Attendee cannot read another participant's row)
  console.log('[Test 6] Security Check: Attendee RLS isolation...');
  const { data: crossData } = await attendeeClient
    .from('participants')
    .select('*')
    .eq('participant_id', 'GFT-0002');
  if (crossData && crossData.length > 0) {
    throw new Error('RLS VIOLATION: Attendee was able to read another participant record!');
  }
  console.log('  -> PASS: Cross-participant read denied by RLS (returns empty set)\n');

  // Test 7: Staff Scan Token Lookup
  console.log('[Test 7] Staff QR Token Lookup (lookup_participant_by_token)...');
  const { data: tokenLookup, error: tlErr } = await staffClient.rpc('lookup_participant_by_token', {
    p_token: myParticipant.qr_token
  });
  if (tlErr || !tokenLookup?.length) throw new Error(`Token lookup failed: ${tlErr?.message}`);
  const found = tokenLookup[0];
  console.log(`  -> Found participant: ${found.participant_display_id} (${found.name}) Status: ${found.gift_status}`);
  if (found.participant_display_id !== 'GFT-0001' || found.gift_status !== 'pending') {
    throw new Error('Token lookup returned wrong participant data');
  }
  console.log('  -> PASS: Staff token lookup works accurately\n');

  // Test 8: Staff Manual Lookup (lookup_by_id_or_name)
  console.log('[Test 8] Staff Manual ID / Name Lookup (lookup_by_id_or_name)...');
  const { data: manualLookup, error: mlErr } = await staffClient.rpc('lookup_by_id_or_name', {
    p_query: 'GFT-0001'
  });
  if (mlErr || !manualLookup?.length) throw new Error(`Manual lookup failed: ${mlErr?.message}`);
  console.log(`  -> Lookup by 'GFT-0001' found: ${manualLookup[0].name}`);
  if (manualLookup[0].participant_id !== found.participant_id) {
    throw new Error('Manual lookup returned wrong participant');
  }
  console.log('  -> PASS: Staff manual search works accurately\n');

  console.log('====================================================');
  console.log('   ALL 8 LIVE INTEGRATION TESTS PASSED PERFECTLY!');
  console.log('====================================================\n');
}

runVerification().catch(err => {
  console.error('\nVerification FAILED:', err);
  process.exit(1);
});
