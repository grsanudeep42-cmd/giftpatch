#!/usr/bin/env node
import { execSync } from 'node:child_process';
try {
  execSync('npx wrangler deploy', { stdio: 'inherit' });
} catch (err) {
  process.exit(1);
}
