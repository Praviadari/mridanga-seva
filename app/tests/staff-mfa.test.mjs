// Unit tests for staff sign-in codes and the client error log (audit 22-10-2026 fixes 15 and 16, migration 0061,
// docs/DECISIONS.md #580-#589): when a session must still give its code, the code box, the error words, the
// private reads held back instead of failing, what an error report may say (no person in it), the wiring of the
// screens, and the te/hi strings. The database side is in supabase/tests/smoke-test.mjs ("0061").
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const mfa = await import('../src/auth/mfa.ts');
const rules = await import('../src/lib/error-report-rules.ts');
const { readLogged } = await import('../src/lib/logged-read.ts');
const { staffCodesErrorKey } = await import('../src/data/staff-mfa.ts');
const { fallbackErrorKey } = await import('../src/data/errors.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);
const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));

/** A token with these claims (unsigned: only the payload is read). */
const token = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const session = (aal, factors) => ({ access_token: token({ sub: 'u1', aal }), user: { factors } });
const verified = { id: 'f-new', status: 'verified', created_at: '2026-10-24T10:00:00Z' };

test('#581: the code is asked when the login has a confirmed code and the session has not given it', () => {
  assert.equal(mfa.tokenAal(token({ aal: 'aal2' })), 'aal2');
  assert.equal(mfa.tokenAal('not-a-token'), null);
  assert.equal(mfa.tokenAal(null), null);
  assert.equal(mfa.sessionNeedsCode(null), false);
  assert.equal(mfa.sessionNeedsCode(session('aal1', [])), false, 'no code: the password is enough');
  assert.equal(mfa.sessionNeedsCode(session('aal1', [{ id: 'f1', status: 'unverified' }])), false, 'a code never confirmed does not count');
  assert.equal(mfa.sessionNeedsCode(session('aal1', [verified])), true);
  assert.equal(mfa.sessionNeedsCode(session('aal2', [verified])), false, 'given already');
  assert.equal(mfa.sessionNeedsCode({ access_token: 'garbled', user: { factors: [verified] } }), true, 'an unreadable token counts as not given');
  assert.equal(mfa.sessionGaveCode(session('aal2', [verified])), true);
  assert.equal(
    mfa.codeFactorId(session('aal1', [{ id: 'f-old', status: 'verified', created_at: '2026-01-01T00:00:00Z' }, verified])),
    'f-new',
    'the newest confirmed code is asked',
  );
});

test('#581: the code box takes six digits, Telugu and Devanagari digits too', () => {
  assert.equal(mfa.typedCode('12 34-56 78'), '123456');
  assert.equal(mfa.typedCode('౧౨౩౪౫౬'), '123456');
  assert.equal(mfa.typedCode('१२३४५६'), '123456');
  assert.equal(mfa.CODE_LENGTH, 6);
  assert.equal(mfa.groupedKey('ABCDEFGHIJKLMNOP'), 'ABCD EFGH IJKL MNOP');
  assert.match(mfa.factorName(new Date('2026-10-24T10:05:00Z')), /^Mridanga Seva 2026-10-24 10:05$/);
});

test('#581: a wrong code, too many tries, a code reset meanwhile and no internet each have their words', () => {
  assert.equal(mfa.mfaErrorKey({ code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' }), 'signInCode.wrong');
  assert.equal(mfa.mfaErrorKey({ message: 'Invalid TOTP code entered' }), 'signInCode.wrong');
  assert.equal(mfa.mfaErrorKey({ code: 'over_request_rate_limit', message: 'x' }), 'signInCode.tooMany');
  assert.equal(mfa.mfaErrorKey({ status: 429, message: 'x' }), 'signInCode.tooMany');
  assert.equal(mfa.mfaErrorKey({ code: 'mfa_totp_enroll_not_enabled', message: 'x' }), 'signInCode.notEnabled');
  assert.equal(mfa.mfaErrorKey({ code: 'mfa_factor_not_found', message: 'x' }), 'signInCode.wasReset');
  assert.equal(mfa.mfaErrorKey({ message: 'Failed to fetch' }), 'common.networkError');
  assert.equal(mfa.mfaErrorKey({ message: 'something else' }), 'common.genericError');
});

test('#582-#584: the switch and the resets say why they were refused', () => {
  assert.equal(staffCodesErrorKey('mfa_required'), 'staffCodes.giveYourCode');
  assert.equal(staffCodesErrorKey('staff_without_code'), 'staffCodes.notEveryone');
  assert.equal(staffCodesErrorKey('reset_in_dashboard'), 'staffCodes.resetInDashboard');
  assert.equal(staffCodesErrorKey('not_allowed'), 'admin.guruOnly');
  assert.equal(staffCodesErrorKey('not_yourself'), 'common.serverErrors.notYourself');
  assert.equal(fallbackErrorKey('mfa_required'), 'common.serverErrors.mfaRequired');
});

test('#583: a private read held back for the code counts as empty and says so; other errors stay errors', async () => {
  const table = () => Promise.resolve({ data: ['table'], error: null });
  const held = await readLogged(Promise.resolve({ data: null, error: { code: 'P0001', message: 'mfa_required' } }), table);
  assert.deepEqual(held, { data: [], error: null, mfaRequired: true });
  const failed = await readLogged(Promise.resolve({ data: null, error: { code: '42501', message: 'not_allowed' } }), table);
  assert.equal(failed.error?.message, 'not_allowed');
  const old = await readLogged(Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'x' } }), table);
  assert.deepEqual(old.data, ['table'], 'before 0034 the table is read');
  // The profile and call screens show everything else, with the notice, and no false "consent missing".
  assert.match(src('data/student-profile.ts'), /privateHidden: \[calls, guardians, consents\]\.some\(\(read\) => read\.mfaRequired === true\)/);
  assert.match(src('data/follow-up.ts'), /privateHidden: guardians\.mfaRequired === true \|\| calls\.mfaRequired === true/);
  const profile = src('app/staff/students/[id].tsx');
  assert.match(profile, /profile\.minor && !profile\.privateHidden && !hasDataConsent/);
  assert.equal((profile.match(/<PrivateHiddenNotice \/>/g) ?? []).length, 2);
  assert.match(src('app/staff/call/[id].tsx'), /context\.privateHidden \? <PrivateHiddenNotice \/>/);
  assert.match(src('app/staff/register.tsx'), /w\.parent\.phone !== null && w\.parent\.email !== null/);
});

test('#585: an error report names the error and the screen pattern, never a message, an id or a person', () => {
  assert.equal(rules.errorName(new TypeError('Cannot read properties of undefined (reading "phone")')), 'TypeError');
  const custom = new Error('x');
  custom.name = 'Invariant Violation';
  assert.equal(rules.errorName(custom), 'Error', 'a name with spaces is not kept');
  assert.equal(rules.errorName({ name: 'AuthApiError', message: 'priya@example.com' }), 'AuthApiError');
  assert.equal(rules.errorName('a thrown string with data'), 'NonError');
  assert.equal(rules.errorName(null), 'NonError');
  assert.equal(rules.screenPattern(['staff', 'students', '[id]']), '/staff/students/[id]');
  assert.equal(rules.screenPattern(['student', '(tabs)', 'my-qr']), '/student/(tabs)/my-qr');
  assert.equal(rules.screenPattern([]), '/');
  assert.equal(rules.screenPattern(['staff', 'students', '6f1c2a90-1111-4222-8333-444455556666']), '/staff/students/[x]');
  assert.equal(rules.screenPattern(['staff', 'Priya']), '/staff/[x]');
  assert.equal(rules.versionTag(null), 'dev');
  assert.equal(rules.versionTag({ kind: 'installed', version: '1.0.0', date: 'x' }), '1.0.0');
  assert.equal(rules.versionTag({ kind: 'update', version: '1.0.0', date: 'x', id: 'a1b2c3d4' }), '1.0.0+a1b2c3d4');
  assert.equal(rules.versionTag({ kind: 'web', site: 'test', commit: '244e9f8', date: 'x' }), 'web-test+244e9f8');
  assert.equal(rules.platformOf('android'), 'android');
  assert.equal(rules.platformOf('windows'), null);
  // What the app sends matches what the database accepts (0061's checks).
  const migration = repo('supabase/migrations/0061_staff_mfa.sql');
  assert.ok(migration.includes(`error_name ~ '^[A-Za-z][A-Za-z0-9_]{0,59}$'`));
  assert.ok(migration.includes(`screen ~ '^(/|(/[a-z_()\\[\\]+-]{1,40}){1,8})$'`));
  for (const s of ['/staff/students/[id]', '/student/(tabs)/my-qr', '/', '/staff/students/[x]', '/+not-found']) {
    assert.match(s, /^(\/|(\/[a-z_()[\]+-]{1,40}){1,8})$/, s);
  }
});

test('#585: reports are wired to the crash screen and to errors nobody caught, once per error, signed in only', () => {
  const report = src('lib/error-report.ts');
  assert.match(report, /if \(!signedIn \|\| !platform \|\| sent >= RUN_LIMIT\) return;/);
  assert.match(report, /if \(seen\.has\(key\)\) return;/);
  assert.match(report, /addEventListener\('unhandledrejection'/);
  assert.match(report, /setGlobalHandler/);
  assert.match(src('components/crash-screen.tsx'), /reportError\('crash', error\)/);
  assert.match(src('app/_layout.tsx'), /<ErrorReporting \/>/);
  assert.match(src('app/_layout.tsx'), /noteScreen\(segments, signedIn\)/);
  assert.match(src('data/app-errors.ts'), /rpc\('log_client_error'/);
});

test('#581: the code step is its own area: no profile, no remembered copy, no other screen before it', () => {
  const provider = src('auth/auth-provider.tsx');
  assert.match(provider, /if \(needsCode\) forgetSavedProfile\(\);/);
  assert.match(provider, /if \(!userId \|\| needsCode\) return;/);
  assert.match(provider, /if \(needsCode\) return 'signInCode';/);
  assert.match(src('app/_layout.tsx'), /guard=\{area === 'signInCode'\}/);
  assert.match(src('app/index.tsx'), /signInCode: '\/sign-in-code'/);
  // No skip: Sign out is the only other way.
  const screen = src('app/sign-in-code.tsx');
  assert.match(screen, /<SignOutButton/);
  assert.doesNotMatch(screen.replace(/^\/\/.*$/gm, ''), /skip/i);
});

test('#580-#587: the screens are reachable: My profile, Set-up, and they are the Guru\'s where they must be', () => {
  assert.match(src('screens/my-profile.tsx'), /router\.push\('\/staff\/my-sign-in-code'\)/);
  assert.match(src('components/admin-links.tsx'), /href: '\/staff\/sign-in-codes'/);
  assert.match(src('components/admin-links.tsx'), /href: '\/staff\/app-errors'/);
  for (const file of ['app/staff/sign-in-codes.tsx', 'app/staff/app-errors.tsx']) {
    assert.match(src(file), /if \(profile\?\.role !== 'guru'\) return <GuruOnly/, file);
  }
  assert.match(src('app/staff/my-sign-in-code.tsx'), /hasCode && !state\.required \?/, 'turning off only while codes are not asked');
});

test('0061 strings exist in te and hi, translated, with the same placeholders, no Telugu next to Hindi', () => {
  const en = locale('en');
  const keys = flat(en).map(([k]) => k).filter((k) => /^(signInCode|myCode|staffCodes|appErrors)\./.test(k)
    || ['common.serverErrors.mfaRequired', 'admin.codesLine', 'admin.errorsLine'].includes(k));
  assert.ok(keys.length >= 90, String(keys.length));
  const sameEverywhere = new Set(['appErrors.line']);
  for (const lang of ['te', 'hi']) {
    const other = locale(lang);
    for (const key of keys) {
      const value = get(other, key);
      assert.equal(typeof value, 'string', `${lang} ${key}`);
      if (!sameEverywhere.has(key)) assert.notEqual(value, get(en, key), `${lang} ${key} is still English`);
      const marks = (s) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
      assert.equal(marks(value), marks(get(en, key)), `${lang} ${key} placeholders`);
    }
  }
  for (const key of keys) {
    assert.doesNotMatch(get(locale('hi'), key), /[ఀ-౿]/, `hi ${key}`);
    assert.doesNotMatch(get(locale('te'), key), /[ऀ-ॿ]/, `te ${key}`);
  }
});
