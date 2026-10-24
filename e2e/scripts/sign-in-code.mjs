// npm run e2e:code: gives the E2E coordinator a sign-in code (0061, OPERATIONS "Staff sign-in codes"), so the
// sign-in flow also goes through the six-digit code step. Signs in with the coordinator's own password and the
// TEST project's publishable key, sets up an authenticator ("TOTP") the way My profile -> My sign-in code does,
// confirms it with a code, and keeps the set-up key only in e2e/.env.e2e. Never prints the key.
//   npm run e2e:code             set one up (stops if the login already has one this file does not know)
//   npm run e2e:code -- --check  only say whether the login and the file agree

import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { e2eLogins, ENV_FILE, setEnvValue, testProject, writeEnvFile } from './lib/env.mjs';
import { totp } from './lib/totp.mjs';

const role = 'COORDINATOR';
const checkOnly = process.argv.includes('--check');

const { url, key } = testProject();
const env = e2eLogins();
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { error: signInError } = await client.auth.signInWithPassword({
  email: env[`E2E_${role}_EMAIL`],
  password: env[`E2E_${role}_PASSWORD`],
});
if (signInError) {
  console.error('e2e:code: the E2E coordinator cannot sign in: ' + signInError.message);
  process.exit(1);
}

const { data: factors, error: listError } = await client.auth.mfa.listFactors();
if (listError) {
  console.error('e2e:code: ' + listError.message);
  process.exit(1);
}
const verified = (factors?.totp ?? []).filter((f) => f.status === 'verified');
const known = env[`E2E_${role}_TOTP_SECRET`];

if (checkOnly) {
  console.log(`e2e:code: the coordinator has ${verified.length} sign-in code(s); e2e/.env.e2e ${known ? 'holds' : 'does not hold'} a key.`);
  process.exit(verified.length > 0 === !!known ? 0 : 1);
}
if (verified.length > 0) {
  if (known) {
    console.log('e2e:code: the coordinator already has a sign-in code and e2e/.env.e2e holds its key; nothing changed.');
    process.exit(0);
  }
  console.error(
    'e2e:code: the E2E coordinator has a sign-in code whose key this file does not hold. A Guru resets it ' +
      '(Set-up -> Sign-in codes -> E2E Coordinator -> Reset), then run this again.',
  );
  process.exit(1);
}

// A set-up started but never confirmed blocks a new one with the same name: remove those first.
for (const f of (factors?.all ?? []).filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
  await client.auth.mfa.unenroll({ factorId: f.id });
}

const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'E2E' });
if (enrollError) {
  console.error('e2e:code: set-up refused: ' + enrollError.message);
  process.exit(1);
}
const secret = enrolled.totp.secret;
const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(secret) });
if (verifyError) {
  console.error('e2e:code: the first code was refused: ' + verifyError.message);
  process.exit(1);
}

writeEnvFile(setEnvValue(readFileSync(ENV_FILE, 'utf8'), `E2E_${role}_TOTP_SECRET`, secret));
console.log('e2e:code: the E2E coordinator now has a sign-in code; its key is in e2e/.env.e2e.');
