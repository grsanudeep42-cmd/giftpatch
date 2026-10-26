#!/usr/bin/env node
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// Read environment
const envText = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();
const supabaseAnonKey = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Exactly mirror src/utils/index.ts
const INDIA_COUNTRY_CODE = '+91';

function normaliseIndianPhone(raw) {
  const parts = String(raw).split(/[,/]/);
  const primary = parts[0].trim();
  const digits = primary.replace(/\D/g, '');

  if (digits.length === 10 || digits.length === 9) {
    return `${INDIA_COUNTRY_CODE}${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  if (digits.length === 13 && digits.startsWith('091')) {
    return `+${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith('974')) {
    return `+${digits}`;
  }

  if (primary.startsWith('+') && digits.length >= 9) {
    return `+${digits}`;
  }

  if (digits.length >= 10) {
    return `+${digits}`;
  }

  throw new Error(`Invalid phone number: "${raw}". Please enter a valid mobile number.`);
}

function phoneToEmail(normalisedPhone) {
  const digits = normalisedPhone.replace(/\D/g, '');
  return `p${digits}@giftpass.event`;
}

async function runFullTest() {
  console.log('======================================================================');
  console.log('       TESTING ALL 181 ATTENDEES (END-TO-END VERIFICATION)           ');
  console.log('======================================================================\n');

  // Load attendees
  const attendees = JSON.parse(fs.readFileSync('scripts/attendees.json', 'utf8'));
  console.log(`Loaded ${attendees.length} attendees from scripts/attendees.json`);

  // Staff client for scanner RPC testing
  const staffClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: staffAuth, error: staffErr } = await staffClient.auth.signInWithPassword({
    email: 'p919392420007@giftpass.event',
    password: 'Staff@2026'
  });
  if (staffErr) {
    console.error('Failed to log in as staff:', staffErr);
    process.exit(1);
  }
  console.log('Staff scanner client authenticated successfully.\n');

  let passedCount = 0;
  const failures = [];
  const warnings = [];

  console.log('Starting individual test for each attendee...\n');

  for (let i = 0; i < attendees.length; i++) {
    const item = attendees[i];
    const { sno, name, raw_phone } = item;
    const isSpecialAdmin = (sno === 7 || raw_phone.includes('9866656855'));
    const password = isSpecialAdmin ? 'Admin@2026' : 'Gift@2026';

    const testErrors = [];

    // 1. Normalisation test using raw input from Excel
    let normalised;
    try {
      normalised = normaliseIndianPhone(raw_phone);
    } catch (err) {
      testErrors.push(`Phone normalization failed on "${raw_phone}": ${err.message}`);
    }

    if (!normalised) {
      failures.push({ sno, name, raw_phone, errors: testErrors });
      console.log(`❌ [${String(sno).padStart(3)}] ${name} (${raw_phone}): NORMALIZATION FAILED`);
      continue;
    }

    // 2. Client Authentication test
    const userClient = createClient(supabaseUrl, supabaseAnonKey);
    const email = phoneToEmail(normalised);
    const { data: authData, error: authErr } = await userClient.auth.signInWithPassword({
      email,
      password
    });

    if (authErr || !authData?.user) {
      testErrors.push(`Login failed for email ${email}: ${authErr?.message || 'No user'}`);
    }

    let participantRecord = null;
    if (authData?.user) {
      // 3. Pass Retrieval Test
      const { data: pData, error: pErr } = await userClient
        .from('participants')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .single();

      if (pErr || !pData) {
        testErrors.push(`Could not retrieve participant pass: ${pErr?.message || 'Not found'}`);
      } else {
        participantRecord = pData;

        // Verify status is pending
        if (participantRecord.gift_status !== 'pending') {
          warnings.push({ sno, name, issue: `Status is '${participantRecord.gift_status}' (not pending)` });
        }

        // 4. Staff QR Token Scan Lookup Test
        const { data: lookupData, error: lookupErr } = await staffClient.rpc('lookup_participant_by_token', {
          p_token: participantRecord.qr_token
        });

        if (lookupErr || !lookupData || lookupData.length === 0) {
          testErrors.push(`Staff QR lookup failed for token ${participantRecord.qr_token}: ${lookupErr?.message || 'Empty'}`);
        } else if (lookupData[0].participant_display_id !== participantRecord.participant_id) {
          testErrors.push(`Staff QR lookup mismatch: expected ${participantRecord.participant_id}, got ${lookupData[0].participant_display_id}`);
        }

        // 5. Staff Manual ID Search Test
        const { data: searchData, error: searchErr } = await staffClient.rpc('lookup_by_id_or_name', {
          p_query: participantRecord.participant_id
        });

        if (searchErr || !searchData || searchData.length === 0) {
          testErrors.push(`Staff manual lookup failed for ID ${participantRecord.participant_id}`);
        }
      }
    }

    if (testErrors.length > 0) {
      failures.push({ sno, name, raw_phone, errors: testErrors });
      console.log(`❌ [${String(sno).padStart(3)}] ${participantRecord?.participant_id || '???'} - ${name} (${raw_phone}): FAILED`);
      testErrors.forEach(e => console.log(`      -> ${e}`));
    } else {
      passedCount++;
      // Log every 20 or special cases so terminal doesn't overflow
      const isInteresting = raw_phone.includes('+') || raw_phone.includes(',') || raw_phone.length < 10 || isSpecialAdmin;
      if (i % 25 === 0 || isInteresting || i === attendees.length - 1) {
        console.log(`✓ [${String(sno).padStart(3)}] ${participantRecord.participant_id} | ${name.padEnd(35)} | Input: ${raw_phone.padEnd(25)} -> E.164: ${normalised} (Pass: OK, Scan: OK)`);
      }
    }
  }

  console.log('\n======================================================================');
  console.log('                          TEST RESULTS                                ');
  console.log('======================================================================');
  console.log(`Total Attendees Tested:   ${attendees.length}`);
  console.log(`Successfully Verified:    ${passedCount} / ${attendees.length} (${((passedCount / attendees.length) * 100).toFixed(1)}%)`);
  console.log(`Failed:                   ${failures.length}`);
  console.log(`Warnings:                 ${warnings.length}`);
  console.log('======================================================================\n');

  if (failures.length > 0) {
    console.error('FAILED ATTENDEES SUMMARY:');
    console.error(JSON.stringify(failures, null, 2));
    process.exit(1);
  } else {
    console.log('🎉 ALL 181 ATTENDEES TESTED AND CONFIRMED 100% OPERATIONAL!');
    console.log('   - Normalization from raw input:   ALL 181 PASS');
    console.log('   - Account authentication:         ALL 181 PASS');
    console.log('   - Pass retrieval (QR token):      ALL 181 PASS');
    console.log('   - Staff QR scan preview:          ALL 181 PASS');
    console.log('   - Staff manual search lookup:     ALL 181 PASS');
  }
}

runFullTest().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
