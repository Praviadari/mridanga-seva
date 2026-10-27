// Unit tests for an abandoned password reset (E5 of the LIVE sign-up test 27-10-2026, docs/DECISIONS.md #660): a reset
// link signs the person in once, and leaving the new-password screen (Back, a reload) must not open their home with the
// old password. src/auth/recovery-mark.ts keeps the mark on the device; the auth provider's wiring is checked in its
// source, because the provider needs React and Supabase. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

/** A fresh copy of the module, as after a reload of the page. */
const reload = () => import(`../src/auth/recovery-mark.ts?start=${Math.random()}`);
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the reset-link mark outlasts a reload and holds only that login', async () => {
  const first = await reload();
  assert.equal(first.recoveryUserId(), null);
  first.markRecovery('user-a');

  const again = await reload();
  assert.equal(again.recoveryUserId(), 'user-a', 'Back or a reload still knows the new password is missing');
  assert.equal(again.isRecoveryLogin(again.recoveryUserId(), 'user-a'), true);
  assert.equal(again.isRecoveryLogin(again.recoveryUserId(), 'user-b'), false, 'never holds back another login');
  assert.equal(again.isRecoveryLogin(again.recoveryUserId(), null), false, 'signed out: the sign-in screen as usual');
  assert.equal(again.isRecoveryLogin(null, 'user-a'), false);

  again.markRecoveryDone();
  assert.equal((await reload()).recoveryUserId(), null, 'saved or signed out: the mark is gone');
});

test('the auth provider keeps a reset-link login on the new-password screen until it is saved or signed out', () => {
  const provider = source('src/auth/auth-provider.tsx');
  assert.match(provider, /event === 'PASSWORD_RECOVERY' && newSession\) markRecovery\(newSession\.user\.id\)/);
  assert.match(provider, /event === 'USER_UPDATED' \|\| event === 'SIGNED_OUT'\) markRecoveryDone\(\)/);
  // Read from the device at start and after every event, not only kept from PASSWORD_RECOVERY in memory.
  assert.match(provider, /useState<string \| null>\(\(\) =>\s*supabaseConfigProblem \? null : recoveryUserId\(\)/);
  assert.match(provider, /setRecoveryUser\(recoveryUserId\(\)\);/);
  // Neither the remembered profile (before the login is restored, or offline) nor the profile opens home or pending.
  assert.match(provider, /if \(!sessionLoaded\) area = recoveryUser \? 'loading' :/);
  assert.match(provider, /else if \(waitingOffline\) area = recovering \? 'recovery' :/);
  const areaFor = provider.slice(provider.indexOf('function areaFor('));
  assert.ok(areaFor.indexOf("return 'recovery'") < areaFor.indexOf("return 'pending'"), 'recovery is decided before pending');
  assert.ok(areaFor.indexOf("return 'recovery'") < areaFor.indexOf('areaForProfile('), 'and before the role');
});

test('a sign-in with the password ends an old mark before its SIGNED_IN event', () => {
  const actions = source('src/auth/auth-actions.ts');
  const signIn = actions.slice(actions.indexOf('export async function signIn('));
  assert.ok(signIn.indexOf('markRecoveryDone()') > 0);
  assert.ok(signIn.indexOf('markRecoveryDone()') < signIn.indexOf('signInWithPassword'));
});
