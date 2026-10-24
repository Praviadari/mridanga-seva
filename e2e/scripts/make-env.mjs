// Writes e2e/.env.e2e with the three E2E login addresses and a new random password for each
// (README "One-time set-up"). Never prints a password; refuses to overwrite an existing file.

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

import { ENV_FILE, writeEnvFile } from './lib/env.mjs';

if (existsSync(ENV_FILE)) {
  console.log('e2e/.env.e2e already exists; nothing changed. Delete it first to make new passwords.');
  process.exit(0);
}

const password = () => 'E2e-' + randomBytes(18).toString('base64url');

writeEnvFile(
  [
    '# E2E logins on the TEST project only (e2e/README.md). Never commit this file, never paste it in a chat.',
    'E2E_STUDENT_EMAIL=e2e.student@example.com',
    `E2E_STUDENT_PASSWORD=${password()}`,
    'E2E_COORDINATOR_EMAIL=e2e.coordinator@example.com',
    `E2E_COORDINATOR_PASSWORD=${password()}`,
    'E2E_GURU_EMAIL=e2e.guru@example.com',
    `E2E_GURU_PASSWORD=${password()}`,
    '# Filled by npm run e2e:code (the coordinator gets a sign-in code; the Guru stays without one).',
    'E2E_COORDINATOR_TOTP_SECRET=',
    '',
  ].join('\n'),
);
console.log('Wrote e2e/.env.e2e with three new passwords. Next: README "One-time set-up" step 2.');
