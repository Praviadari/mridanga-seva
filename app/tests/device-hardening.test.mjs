// Unit tests for the device hardening of the production APK (audit brief 9; docs/DECISIONS.md #236-#239): the
// time limit on the app's calls (src/lib/timed-fetch.ts), the pending sign-out that ends an offline-signed-out
// login on the server (src/auth/pending-sign-out.ts), and the Android settings in app.json.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

// The device's storage: a plain map in Node (src/lib/local-storage.ts uses the global localStorage).
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { withTimeout, TIMEOUT_MESSAGE } = await import('../src/lib/timed-fetch.ts');
const pending = await import('../src/auth/pending-sign-out.ts');
const { isNetworkError } = await import('../src/data/errors.ts');

/** A fetch that never answers; records the signal it was given. */
function stalledFetch(seen) {
  return (_input, init) => {
    seen.signal = init?.signal;
    return new Promise(() => undefined);
  };
}

test('timeout: a call with no answer fails as a network error, and its request is cancelled', async () => {
  const seen = {};
  const timed = withTimeout(stalledFetch(seen), 30);
  await assert.rejects(timed('https://x.supabase.co/rest/v1/profiles'), (error) => {
    assert.ok(error instanceof TypeError);
    assert.equal(error.message, TIMEOUT_MESSAGE);
    assert.ok(isNetworkError(error.message), 'screens show "Could not reach the server"');
    return true;
  });
  assert.equal(seen.signal.aborted, true);
});

test('timeout: an answer in time passes through, and the timer stops (no late cancel)', async () => {
  const seen = {};
  const timed = withTimeout(async (_input, init) => {
    seen.signal = init.signal;
    return new Response('ok', { status: 200 });
  }, 30);
  const response = await timed('https://x.supabase.co/rest/v1/profiles');
  assert.equal(await response.text(), 'ok');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(seen.signal.aborted, false, 'reading a long body later is not cut off');
});

test("timeout: the caller's own signal still cancels the call", async () => {
  const caller = new AbortController();
  const timed = withTimeout(
    (_input, init) =>
      new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted by caller')))),
    10_000,
  );
  const call = timed('https://x.supabase.co/rest/v1/profiles', { signal: caller.signal });
  caller.abort();
  await assert.rejects(call, /aborted by caller/);
});

test('timeout: Storage uploads keep no time limit; Storage reads do', async () => {
  const seen = {};
  const base = (_input, init) => {
    seen.signal = init?.signal;
    return Promise.resolve(new Response('ok'));
  };
  const timed = withTimeout(base, 30);
  await timed('https://x.supabase.co/storage/v1/object/answers/a.mp4', { method: 'POST', body: 'x' });
  assert.equal(seen.signal, undefined, 'upload passed on untouched');
  await timed('https://x.supabase.co/storage/v1/object/sign/answers/a.mp4', { method: 'GET' });
  assert.ok(seen.signal, 'a read gets the time limit');
});

/** A fake auth server: answers by path, records the calls. */
function fakeServer(answers) {
  const calls = [];
  const fetch = async (input, init) => {
    const url = new URL(input);
    const path = url.pathname;
    calls.push({ path, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization ?? null });
    const answer = answers[path];
    if (answer instanceof Error) throw answer;
    const { status, body } = typeof answer === 'function' ? answer(init) : answer;
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { calls, server: { url: 'https://x.supabase.co', key: 'anon', fetch } };
}

test('pending sign-out: kept, then ended on the server (refresh, then /logout with the new access token)', async () => {
  store.clear();
  pending.keepPendingSignOut('old-refresh');
  assert.deepEqual(pending.pendingSignOuts(), ['old-refresh']);
  const { calls, server } = fakeServer({
    '/auth/v1/token': { status: 200, body: { access_token: 'fresh-access', refresh_token: 'new-refresh' } },
    '/auth/v1/logout': { status: 204 },
  });
  await pending.finishPendingSignOuts(server);
  assert.deepEqual(calls.map((call) => call.path), ['/auth/v1/token', '/auth/v1/logout']);
  assert.deepEqual(calls[0].body, { refresh_token: 'old-refresh' });
  assert.equal(calls[1].auth, 'Bearer fresh-access');
  assert.deepEqual(pending.pendingSignOuts(), []);
  assert.equal(store.has(pending.PENDING_KEY), false, 'nothing left on the device');
});

test('pending sign-out: no internet keeps it for the next try', async () => {
  store.clear();
  pending.keepPendingSignOut('old-refresh');
  const { server } = fakeServer({ '/auth/v1/token': new TypeError('Network request failed') });
  await pending.finishPendingSignOuts(server);
  assert.deepEqual(pending.pendingSignOuts(), ['old-refresh']);
});

test('pending sign-out: a token the server refuses (already ended) is dropped', async () => {
  store.clear();
  pending.keepPendingSignOut('dead-refresh');
  const { calls, server } = fakeServer({
    '/auth/v1/token': { status: 400, body: { error_code: 'refresh_token_not_found' } },
  });
  await pending.finishPendingSignOuts(server);
  assert.equal(calls.length, 1, 'no /logout needed');
  assert.deepEqual(pending.pendingSignOuts(), []);
});

test('pending sign-out: refreshed but /logout unreachable keeps the NEW token (the old one is used up)', async () => {
  store.clear();
  pending.keepPendingSignOut('old-refresh');
  const { server } = fakeServer({
    '/auth/v1/token': { status: 200, body: { access_token: 'fresh-access', refresh_token: 'new-refresh' } },
    '/auth/v1/logout': new TypeError('Network request failed'),
  });
  await pending.finishPendingSignOuts(server);
  assert.deepEqual(pending.pendingSignOuts(), ['new-refresh']);
});

test('pending sign-out: server trouble (500, 429) waits; nothing pending makes no call; null server does nothing', async () => {
  store.clear();
  pending.keepPendingSignOut('old-refresh');
  const busy = fakeServer({ '/auth/v1/token': { status: 429, body: {} } });
  await pending.finishPendingSignOuts(busy.server);
  assert.deepEqual(pending.pendingSignOuts(), ['old-refresh']);
  await pending.finishPendingSignOuts(null);
  assert.deepEqual(pending.pendingSignOuts(), ['old-refresh']);
  store.clear();
  const idle = fakeServer({});
  await pending.finishPendingSignOuts(idle.server);
  assert.equal(idle.calls.length, 0);
});

test('pending sign-out: the same token is kept once, at most 5, damaged storage reads as none', () => {
  store.clear();
  for (const token of ['a', 'b', 'a', 'c', 'd', 'e', 'f']) pending.keepPendingSignOut(token);
  // 'a' again moves to the end; then the oldest ('b') drops off.
  assert.deepEqual(pending.pendingSignOuts(), ['a', 'c', 'd', 'e', 'f']);
  store.set(pending.PENDING_KEY, '{not json');
  assert.deepEqual(pending.pendingSignOuts(), []);
});

test('pending sign-out: two runs at once call the server once', async () => {
  store.clear();
  pending.keepPendingSignOut('old-refresh');
  const { calls, server } = fakeServer({
    '/auth/v1/token': { status: 200, body: { access_token: 'fresh-access', refresh_token: 'new-refresh' } },
    '/auth/v1/logout': { status: 204 },
  });
  await Promise.all([pending.finishPendingSignOuts(server), pending.finishPendingSignOuts(server)]);
  assert.equal(calls.filter((call) => call.path === '/auth/v1/token').length, 1);
});

test('app.json: no Android backup, no overlay or legacy storage permission (D3-02)', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  assert.equal(expo.android.allowBackup, false);
  for (const permission of ['SYSTEM_ALERT_WINDOW', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) {
    assert.ok(expo.android.blockedPermissions.includes(`android.permission.${permission}`), permission);
  }
});

test('sign out reads the refresh token BEFORE calling Supabase (it deletes the login, then reports the error)', () => {
  const source = readFileSync(new URL('../src/auth/auth-actions.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function signOut'));
  assert.ok(body.indexOf('storedRefreshToken()') < body.indexOf('supabase.auth.signOut'));
  assert.ok(body.includes('keepPendingSignOut(refreshToken)'));
});
