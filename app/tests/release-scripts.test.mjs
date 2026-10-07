// Checks of scripts/bundle-checks.mjs and scripts/lib/env-file.mjs (docs/DECISIONS.md #154, #155).
// Run from app/: node --test tests/release-scripts.test.mjs
// Fake secrets are put together at run time, so no secret scanner mistakes this file for a leak.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { secretIn, settingsProblem, supabaseSettingsFrom } from '../scripts/bundle-checks.mjs';

const REF = 'abcdefghij0123456789';
const URL = `https://${REF}.supabase.co`;
const KEY = 'sb_' + 'publishable_' + 'Ab3-dEf_ghIJkl9mnoPQRstu7vwXyz0';
const jwt = (payload) =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'c2lnbmF0dXJl'].join('.');

test('env files are read with Expo\'s rules', () => {
  const text = [
    '# comment line',
    `export EXPO_PUBLIC_SUPABASE_URL="${URL}"   # the test project`,
    `EXPO_PUBLIC_SUPABASE_KEY='${KEY}'`,
    '',
  ].join('\r\n');
  assert.deepEqual(supabaseSettingsFrom(text), { EXPO_PUBLIC_SUPABASE_URL: URL, EXPO_PUBLIC_SUPABASE_KEY: KEY });
  // An unquoted inline comment is not part of the value (the old parser kept it).
  assert.equal(supabaseSettingsFrom(`EXPO_PUBLIC_SUPABASE_KEY=${KEY} # note\n`).EXPO_PUBLIC_SUPABASE_KEY, KEY);
  // Empty values count as missing.
  assert.deepEqual(supabaseSettingsFrom('EXPO_PUBLIC_SUPABASE_URL=\n'), {});
});

test('setting shapes', () => {
  assert.equal(settingsProblem({ EXPO_PUBLIC_SUPABASE_URL: URL, EXPO_PUBLIC_SUPABASE_KEY: KEY }), null);
  assert.equal(settingsProblem({ EXPO_PUBLIC_SUPABASE_URL: URL + '/', EXPO_PUBLIC_SUPABASE_KEY: jwt({ role: 'anon' }) }), null);
  assert.match(settingsProblem({ EXPO_PUBLIC_SUPABASE_URL: `"${URL}"`, EXPO_PUBLIC_SUPABASE_KEY: KEY }), /URL/);
  assert.match(settingsProblem({ EXPO_PUBLIC_SUPABASE_URL: URL, EXPO_PUBLIC_SUPABASE_KEY: KEY + ' # note' }), /KEY/);
  assert.match(settingsProblem({ EXPO_PUBLIC_SUPABASE_URL: URL, EXPO_PUBLIC_SUPABASE_KEY: jwt({ role: 'service_role' }) }), /KEY/);
});

test('secret shapes are found', () => {
  const secrets = {
    'sb_secret_ key': 'sb_' + 'secret_' + 'Xy7-AbCdEfGhIjKlMnOpQrStUvWxYz012',
    'service_role JWT': jwt({ role: 'service_role' }),
    'supabase_admin JWT': jwt({ role: 'supabase_admin' }),
    'sbp_ token': 'sb' + 'p_' + '0123456789abcdef'.repeat(3).slice(0, 40),
    'PEM key': '-----BEGIN ' + 'PRIVATE KEY-----\nMIIE',
    'RSA PEM key': '-----BEGIN RSA ' + 'PRIVATE KEY-----',
    'Postgres URL': 'postgres' + 'ql://postgres.' + REF + ':hunter2pass@aws-0.pooler.supabase.com:5432/postgres',
    'Google key': 'AI' + 'za' + 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
    'GitHub token': 'gh' + 'p_' + 'A1b2C3d4E5'.repeat(4).slice(0, 36),
    'GitHub fine-grained token': 'github' + '_pat_' + 'A1b2C3d4E5_'.repeat(8),
    'Slack token': 'xo' + 'xb-' + '1234567890-abcdefABCDEF',
    'AWS key': 'AK' + 'IA' + 'ABCDEFGHIJ234567',
    'Expo token by name': 'EXPO' + '_TOKEN="' + 'aB3dE6gH9jK2mN5pQ8sT1vW4' + '"',
  };
  for (const [name, secret] of Object.entries(secrets)) {
    assert.ok(secretIn(`var a="x";var b="${secret}";`), `${name} in text`);
  }
});

test('the app\'s own code is not a secret', () => {
  const app = `if(k.startsWith('sb_secret_')||jwtRole(k)==='service_role')return'secretKey';`;
  assert.equal(secretIn(app), null);
  assert.equal(secretIn(`${KEY} ${URL} ${jwt({ role: 'anon' })} postgres://localhost/db AIza short`), null);
});

test('bytecode: the app literal running into the next string is not a key; a real key is', () => {
  // Hermes keeps strings end to end (seen in the TEST bundle 07-10-2026).
  assert.equal(secretIn('xxsb_secret__getObserverIDeletexx', { bytecode: true }), null);
  assert.equal(secretIn('sb_secret_' + 'getObserverIDeleteAndSomeMoreNamesHere', { bytecode: true }), null);
  const key = 'sb_' + 'secret_' + 'Xy7AbCdEfGhIjKlMnOpQrStUvWxYz012';
  assert.ok(secretIn(`${key}somethingElse`, { bytecode: true }), 'a key with digits');
  assert.ok(secretIn(`sb_secret_getObserver ${'sb_'}secret_AbCdEfGhIjKlMnOpQrStUvWxYzAbCdE`, { bytecode: true }), 'two occurrences');
});
