#!/usr/bin/env node
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env.local', 'utf8');
const supabaseUrl = envText.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();
const supabaseAnonKey = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.replace(/[^\x20-\x7E]/g, '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('--- GiftPass Database Seeder ---');
  console.log(`Connecting to: ${supabaseUrl}`);

  // 1. Log in as admin
  console.log('Logging in as Admin (9866656855)...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'p919866656855@giftpass.event',
    password: 'Admin@2026'
  });

  if (authErr || !authData.session) {
    console.error('Failed to log in as admin:', authErr);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log('Admin authenticated successfully.');

  // 2. Load attendees
  const attendees = JSON.parse(fs.readFileSync('scripts/attendees.json', 'utf8'));
  console.log(`Loaded ${attendees.length} attendees from scripts/attendees.json`);

  const BATCH_SIZE = 25;
  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  const failedItems = [];

  for (let i = 0; i < attendees.length; i += BATCH_SIZE) {
    const chunk = attendees.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(attendees.length / BATCH_SIZE);

    console.log(`Sending Batch ${batchNum}/${totalBatches} (${chunk.length} rows: ${chunk[0].sno} to ${chunk[chunk.length - 1].sno})...`);

    const res = await fetch(`${supabaseUrl}/functions/v1/import-participants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        rows: chunk.map((c) => ({ name: c.name, phone: c.phone }))
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Batch ${batchNum} failed with status ${res.status}:`, errText);
      totalFailed += chunk.length;
      failedItems.push(...chunk.map(c => ({ ...c, error: errText })));
      continue;
    }

    const result = await res.json();
    totalImported += result.imported;
    totalSkipped += result.skipped;
    totalFailed += result.failed;

    if (result.failed > 0) {
      const errs = result.rows.filter(r => r.status === 'error');
      failedItems.push(...errs);
      console.warn(`  Batch had ${result.failed} errors:`, errs);
    }

    console.log(`  -> Imported: ${result.imported}, Skipped: ${result.skipped}, Failed: ${result.failed}`);
  }

  console.log('\n=======================================');
  console.log(`Seeding Complete!`);
  console.log(`Total Imported: ${totalImported}`);
  console.log(`Total Skipped:  ${totalSkipped}`);
  console.log(`Total Failed:   ${totalFailed}`);
  console.log('=======================================');

  if (failedItems.length > 0) {
    console.error('Failed items:', JSON.stringify(failedItems, null, 2));
  }
}

main().catch((err) => {
  console.error('Unhandled error during seeding:', err);
  process.exit(1);
});
