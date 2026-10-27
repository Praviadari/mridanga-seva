// Unit tests for the launch audit's fixes (15-10-2026, docs/DECISIONS.md #390-#409). Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------- #390 possible duplicates at the desk

const { duplicateKey, duplicateQuery, duplicatesFrom } = await import('../src/lib/duplicates.ts');

test('possible_duplicates rows become a list without the sign-up the desk works from', () => {
  const rows = [
    { kind: 'student', id: 's1', roll_no: 'MS-2026-0016', full_name: 'Ravi Kumar', centre: 'Abids', since: '2026-10-15',
      withdrawn: false, matched: ['name_dob'] },
    { kind: 'sign_up', id: 'p1', roll_no: null, full_name: 'Ravi Kumar', centre: 'Abids', since: '2026-10-14', withdrawn: false,
      matched: ['name_dob', 'phone'] },
    { kind: 'sign_up', id: 'p2', roll_no: null, full_name: 'Ravi K', centre: null, since: null, withdrawn: false, matched: ['phone'] },
    { kind: 'other', id: 'x', full_name: 'Nobody' },
    null,
  ];
  const list = duplicatesFrom(rows, 'p1');
  assert.deepEqual(list.map((d) => d.id), ['s1', 'p2']);
  assert.deepEqual(
    { ...list[0] },
    { kind: 'student', id: 's1', rollNo: 'MS-2026-0016', fullName: 'Ravi Kumar', centre: 'Abids', since: '2026-10-15',
      withdrawn: false, sameNameAndBirth: true, samePhone: false },
  );
  assert.equal(list[1].samePhone, true);
  assert.deepEqual(duplicatesFrom(null), []);
  assert.deepEqual(duplicatesFrom({ not: 'a list' }), []);
});

test('the desk asks only with a name and birth date, or a phone of 7 or more digits', () => {
  assert.equal(duplicateQuery('Ravi', null, null), null);
  assert.equal(duplicateQuery('', '1990-05-01', '12345'), null);
  assert.deepEqual(duplicateQuery(' Ravi Kumar ', '1990-05-01', ''), { p_full_name: 'Ravi Kumar', p_dob: '1990-05-01', p_phone: null });
  assert.deepEqual(duplicateQuery('Ravi', null, '98765 43210'), { p_full_name: 'Ravi', p_dob: null, p_phone: '98765 43210' });
  // The key ignores case and the phone's spaces, so the list stays for the same person and goes for another.
  assert.equal(
    duplicateKey(duplicateQuery('Ravi Kumar', '1990-05-01', '98765 43210')),
    duplicateKey(duplicateQuery('ravi kumar', '1990-05-01', '9876543210')),
  );
  assert.notEqual(
    duplicateKey(duplicateQuery('Ravi Kumar', '1990-05-01', null)),
    duplicateKey(duplicateQuery('Ravi Kumar', '1990-05-02', null)),
  );
});

test('Register a student asks possible_duplicates at Next and on Accept, and shows the answer', () => {
  const data = src('data/students.ts');
  assert.match(data, /rpc\('possible_duplicates', query\)/);
  const screen = src('app/staff/register.tsx');
  const next = screen.slice(screen.indexOf('function next()'), screen.indexOf('async function save()'));
  assert.match(next, /fetchPossibleDuplicates\(form\.fullName, dob, form\.phone, fromSignUp\?\.id \?\? null\)/);
  const ask = screen.slice(screen.indexOf('function askAccept('), screen.indexOf('async function confirmAccept('));
  assert.match(ask, /fetchPossibleDuplicates\(person\.full_name, person\.dob, person\.phone \?\? null, person\.id\)/);
  assert.match(screen, /<PossibleDuplicates\s+place="save"/);
  assert.match(screen, /<PossibleDuplicates place="accept"/);
});

test('a form filled from a sign-up that did not connect the login says the sign-up still waits (#392)', () => {
  const screen = src('app/staff/register.tsx');
  assert.match(screen, /fromSignUp: !!fromSignUp/);
  assert.match(screen, /saved\.fromSignUp && !saved\.registered\.linked/);
  for (const lang of ['en', 'te', 'hi']) {
    const json = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
    assert.match(json.register.signUpNotLinked, /\{\{name\}\}/, lang);
  }
});

// ---------------------------------------------------------------- #393 a busy token refresh keeps the login

const { isBusyRefresh, refreshGuard, BUSY_REFRESH_MESSAGE } = await import('../src/lib/refresh-guard.ts');

test('only a 429 to a token refresh counts as "busy"', () => {
  const refresh = 'https://x.supabase.co/auth/v1/token?grant_type=refresh_token';
  assert.equal(isBusyRefresh(refresh, 'POST', 429), true);
  assert.equal(isBusyRefresh(refresh, 'POST', 400), false);
  assert.equal(isBusyRefresh('https://x.supabase.co/auth/v1/token?grant_type=password', 'POST', 429), false);
  assert.equal(isBusyRefresh('https://x.supabase.co/rest/v1/students?grant_type=refresh_token', 'POST', 429), false);
  assert.equal(isBusyRefresh(refresh, 'GET', 429), false);
});

/**
 * Runs the real auth client (@supabase/auth-js, as installed) on a saved login whose access token has expired, with
 * a server that answers every token refresh "429 too many requests"; returns whether the login is still saved.
 */
async function loginSurvivesBusyRefresh(guarded) {
  const { createRequire } = await import('node:module');
  const { GoTrueClient } = createRequire(import.meta.url)('@supabase/auth-js');
  const key = 'sb-test-auth-token';
  const saved = new Map();
  const now = Math.floor(Date.now() / 1000);
  saved.set(key, JSON.stringify({
    access_token: 'expired', refresh_token: 'r1', token_type: 'bearer', expires_in: 3600, expires_at: now - 600,
    user: { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  }));
  const storage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => void saved.set(k, v), removeItem: (k) => void saved.delete(k) };
  let refreshes = 0;
  const realNow = Date.now;
  const server = async (input) => {
    if (String(input).includes('grant_type=refresh_token')) {
      refreshes += 1;
      // Past the auth client's 30 s retry window after the first try, so the test does not wait for its back-off.
      Date.now = () => realNow() + 60_000;
    }
    return new Response(JSON.stringify({ code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }),
      { status: 429, headers: { 'content-type': 'application/json' } });
  };
  const client = new GoTrueClient({
    url: 'https://x.supabase.co/auth/v1', storageKey: key, storage, autoRefreshToken: false, persistSession: true,
    detectSessionInUrl: false, fetch: guarded ? refreshGuard(server) : server,
  });
  try {
    await client.getSession();
  } finally {
    Date.now = realNow;
  }
  assert.ok(refreshes >= 1, 'a refresh was tried');
  return saved.has(key);
}

test('a token refresh refused as busy (429) no longer signs the person out', async () => {
  // Without the guard the installed auth client deletes the saved login (the bug); with it the login stays.
  assert.equal(await loginSurvivesBusyRefresh(false), false);
  assert.equal(await loginSurvivesBusyRefresh(true), true);
  assert.match(BUSY_REFRESH_MESSAGE, /Network request failed/);
  assert.match(src('lib/supabase.ts'), /withTimeout\(refreshGuard\(/);
});

// ---------------------------------------------------------------- #394 My QR's door line: one call, stops once in

test('the door line asks student_home only, and stops asking once the check-in shows', () => {
  // data/home.ts loads native modules through its imports, so its function is read, not run.
  const home = src('data/home.ts');
  const door = home.slice(home.indexOf('export async function fetchDoorVisit('), home.indexOf('// ---------------------------------------------------------------- C1'));
  assert.match(door, /supabase\.rpc\('student_home'\)/);
  assert.doesNotMatch(door, /fetchWeekStarts|\.from\(/);
  assert.match(door, /hereNow: row\.here_now, lastVisitAt: row\.last_visit_at/);
  const screen = src('app/student/my-qr.tsx');
  const hook = screen.slice(screen.indexOf('function useDoorStatus('), screen.indexOf('function DoorLine('));
  assert.match(hook, /fetchDoorVisit\(\)/);
  assert.match(hook, /if \(next\.kind === 'in'\) clearInterval\(timer\)/);
  assert.doesNotMatch(hook, /fetchStudentHome/);
});

// ---------------------------------------------------------------- #391 My QR asks again on focus

test('My QR loads the card each time it comes into view, not once per mount', () => {
  const screen = src('app/student/my-qr.tsx');
  const focus = screen.indexOf('useFocusEffect(');
  assert.ok(focus >= 0 && screen.indexOf('fetchMyCard(profileId)', focus) > focus, 'fetchMyCard inside useFocusEffect');
  assert.doesNotMatch(screen, /useEffect\(\(\) => \{\s*if \(!profileId\)/);
});

// ---------------------------------------------------------------- #395 production updates only from a clean, pushed main

const { releaseGitState } = await import('../scripts/lib/release-git.mjs');

/** A stand-in for git: answers per command, null = git failed or is missing. */
const fakeGit = ({ status = '', branch = 'main\n', head = 'a'.repeat(40), pushed = 'a'.repeat(40) } = {}) => (args) => {
  const command = args.join(' ');
  if (command === 'status --porcelain') return status;
  if (command === 'rev-parse --abbrev-ref HEAD') return branch;
  if (command === 'rev-parse HEAD') return head;
  if (command === 'rev-parse --verify --quiet origin/main') return pushed;
  throw new Error('unexpected git ' + command);
};

test('a clean main equal to origin/main has nothing against a publish', () => {
  assert.deepEqual(releaseGitState(fakeGit()), { problems: [], commit: 'aaaaaaa' });
});

test('a branch, uncommitted or new files, or an unpushed commit are each named (LA-16)', () => {
  const state = releaseGitState(fakeGit({
    status: ' M src/app/student/my-qr.tsx\n?? src/app/new-screen.tsx\n',
    branch: 'launch-audit\n',
    head: 'b'.repeat(40),
  }));
  assert.equal(state.problems.length, 3);
  assert.match(state.problems[0], /on launch-audit, not main/);
  assert.match(state.problems[1], /^2 file\(s\) changed or new.*src\/app\/student/);
  assert.match(state.problems[2], /not origin\/main/);
  assert.equal(state.commit, 'bbbbbbb');
  assert.match(releaseGitState(fakeGit({ pushed: null })).problems[0], /origin\/main is unknown/);
  assert.match(releaseGitState(() => null).problems[0], /git does not run/);
});

test('publish-update stops a production update on those problems before anything else, preview only warns', () => {
  const script = readFileSync(new URL('../scripts/publish-update.mjs', import.meta.url), 'utf8');
  const guard = script.indexOf('const gitState = releaseGitState();');
  assert.ok(guard > 0 && guard < script.indexOf("'runtimeversion:resolve'"), 'checked before the fingerprint and EAS');
  assert.match(script, /if \(channel === 'production' && !checkOnly\) \{\s*fail\(/);
});
// ---------------------------------------------------------------- #397 an email that could not be sent is not "no internet"

/** The error the real auth client (@supabase/auth-js, as installed) gives for one call answered with `status` and `body`. */
async function authErrorFor(call, status, body) {
  const { createRequire } = await import('node:module');
  const { GoTrueClient } = createRequire(import.meta.url)('@supabase/auth-js');
  const memory = new Map();
  const client = new GoTrueClient({
    url: 'https://x.supabase.co/auth/v1', headers: { apikey: 'k' }, persistSession: false, autoRefreshToken: false,
    storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) },
    // Supabase Auth names its API version, which tells auth-js to read `code` from the body.
    fetch: async () => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
    }),
  });
  const { error } = await call(client);
  return error;
}
const { authErrorKey, signUpErrorKey } = await import('../src/auth/auth-errors.ts');
const signUpCall = (c) => c.signUp({ email: 'a@example.org', password: 'long enough 1' });
const resetCall = (c) => c.resetPasswordForEmail('a@example.org');

test('Supabase could not send the sign-up or reset email (500): the person is told so, not "check your internet" (LA-22)', async () => {
  const signUpError = await authErrorFor(signUpCall, 500, { code: 'unexpected_failure', msg: 'Error sending confirmation email' });
  assert.equal(signUpErrorKey(signUpError), 'authErrors.emailNotSent');
  const resetError = await authErrorFor(resetCall, 500, { code: 'unexpected_failure', msg: 'Error sending recovery email' });
  assert.equal(authErrorKey(resetError), 'authErrors.emailNotSent');
  // Unchanged: a refused new login (#292), another server failure, a busy server.
  assert.equal(signUpErrorKey(await authErrorFor(signUpCall, 500, { msg: 'Database error saving new user' })), 'authErrors.signUpRefused');
  assert.equal(authErrorKey(await authErrorFor(resetCall, 500, { msg: 'Internal server error' })), 'common.networkError');
  assert.equal(authErrorKey(await authErrorFor(resetCall, 503, { msg: 'unavailable' })), 'common.networkError');
});

test('the email limit (per hour, or 60 s per address) says the email waits; other rate limits stay "too many tries"', async () => {
  const hourly = await authErrorFor(signUpCall, 429, { code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' });
  assert.equal(signUpErrorKey(hourly), 'authErrors.emailNotSent');
  const requests = await authErrorFor(signUpCall, 429, { code: 'over_request_rate_limit', msg: 'Request rate limit reached' });
  assert.equal(signUpErrorKey(requests), 'authErrors.rateLimited');
});

test('a second reset email within 60 s says "wait a minute", not "could not be sent" (E5, #661)', async () => {
  const again = await authErrorFor(resetCall, 429, {
    code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 52 seconds.',
  });
  assert.equal(authErrorKey(again), 'authErrors.waitAMinute');
  const oneSecond = await authErrorFor(resetCall, 429, {
    code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 1 second.',
  });
  assert.equal(authErrorKey(oneSecond), 'authErrors.waitAMinute');
});