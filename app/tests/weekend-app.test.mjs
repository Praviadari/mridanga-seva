// Unit tests for the weekend-app fixes before the registration weekend (docs/DECISIONS.md #291-#294, audit
// phase 2 R2-01, R2-03, R2-08, R4-03, R1-01, R1-03 and phase 1 FF-01, FF-02): the whole waiting list with
// search and paging, the desk's messages for the 0047/0048 codes, the crash screen's Restart and hand-over to
// expo-updates, and the LIVE web addresses. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { filterWaiting, matchesWaiting, WAITING_PAGE, waitingAction } = await import('../src/lib/waiting-list.ts');
const { acceptErrorKey, registerErrorKey } = await import('../src/data/students.ts');
const { fallbackErrorKey } = await import('../src/data/errors.ts');
const { handOverToUpdates, STARTUP_WINDOW_MS } = await import('../src/lib/crash-recovery.ts');
const { restartApp } = await import('../src/lib/slow-start.ts');
const { updates } = await import('./stubs/expo-updates.mjs');
const { checkPersonName } = await import('../src/lib/person-name.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locales = Object.fromEntries(
  ['en', 'te', 'hi'].map((l) => [l, JSON.parse(readFileSync(new URL(`../src/i18n/locales/${l}.json`, import.meta.url), 'utf8'))]),
);
/** The text of a key such as 'register.acceptErrors.noNotice' in one language, or undefined. */
const text = (lang, key) => key.split('.').reduce((o, k) => o?.[k], locales[lang]);
/** Every key exists, as non-empty text, in en, te and hi. */
function assertWorded(...keys) {
  for (const key of keys) for (const lang of ['en', 'te', 'hi']) assert.ok(text(lang, key), `${lang}: ${key}`);
}

// ---------------------------------------------------------------- R2-01 the waiting list (#291)

/** A waiting sign-up, an adult with a privacy tick unless the test says otherwise. */
const person = (over = {}) => ({
  id: crypto.randomUUID(),
  full_name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '+919876543210',
  dob: '1990-05-01',
  centre_id: 1,
  created_at: '2026-10-16T10:00:00Z',
  notice_version: '0.1',
  ...over,
});

test('the search finds a sign-up by part of the name or email, any case', () => {
  const asha = person();
  assert.equal(matchesWaiting(asha, ''), true, 'an empty search shows everyone');
  assert.equal(matchesWaiting(asha, '  '), true);
  assert.equal(matchesWaiting(asha, 'rao'), true);
  assert.equal(matchesWaiting(asha, 'ASHA  R'), true, 'spaces collapse');
  assert.equal(matchesWaiting(asha, 'EXAMPLE.COM'), true);
  assert.equal(matchesWaiting(asha, 'bhavani'), false);
  assert.equal(matchesWaiting(person({ full_name: 'రమ్య' }), 'రమ్య'), true, 'Telugu names');
  assert.equal(matchesWaiting(person({ email: null, phone: null }), 'rao'), true, 'no email or phone');
});

test('the search finds a sign-up by three or more digits of the phone, spaces and +91 ignored', () => {
  const asha = person();
  assert.equal(matchesWaiting(asha, '98765'), true);
  assert.equal(matchesWaiting(asha, '98765 43210'), true);
  assert.equal(matchesWaiting(asha, '+91 98765'), true);
  assert.equal(matchesWaiting(asha, '98'), false, 'two digits match nearly everyone: not searched');
  assert.equal(matchesWaiting(asha, '12345'), false);
  assert.equal(matchesWaiting(person({ phone: null }), '98765'), false);
});

test('the whole list is searched, in the server order, not only the newest ten', () => {
  const list = Array.from({ length: 25 }, (_, i) => person({ full_name: `Person ${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}`, email: `p${i}@example.com`, phone: null }));
  assert.equal(WAITING_PAGE, 10);
  assert.equal(filterWaiting(list, '').length, 25, 'everyone, the screen pages them');
  const found = filterWaiting(list, 'Person PP');
  assert.equal(found.length, 1);
  assert.equal(found[0].email, 'p15@example.com', 'row 16 is found');
  assert.deepEqual(filterWaiting(list, 'example.com').map((p) => p.email), list.map((p) => p.email), 'order kept');
});

test('Accept only for an adult with a date of birth, a name that passes and the privacy tick (FF-01)', () => {
  assert.equal(waitingAction(person()), 'accept');
  assert.equal(waitingAction(person({ notice_version: undefined })), 'accept', 'a server before 0047 does not ask for it');
  assert.equal(waitingAction(person({ notice_version: null })), 'noNotice');
  assert.equal(waitingAction(person({ dob: null })), 'noDob');
  assert.equal(waitingAction(person({ dob: '2015-01-01' })), 'minor');
  assert.equal(waitingAction(person({ full_name: 'Asha 2' })), 'name');
  assertWorded('register.waitingNoNotice', 'register.waitingMore', 'register.waitingSearch', 'register.waitingSearchHint',
    'register.waitingNoMatch', 'register.waitingRefresh', 'register.waitingStale', 'register.waitingLoadFailed');
});

test('Register a student draws the matches a page at a time, with search, refresh and pull-down', () => {
  const screen = src('app/staff/register.tsx');
  assert.doesNotMatch(screen, /waiting\.slice\(0, 10\)/, 'the old ten-row cut is gone');
  assert.match(screen, /waitingMatches\.slice\(0, waitingShown\)/);
  assert.match(screen, /onRefresh=\{refreshWaiting\}/);
  assert.match(screen, /useFocusEffect\(/);
  assert.match(screen, /canAccept = action === 'accept'/);
});

// ---------------------------------------------------------------- R2-03 the desk's messages (#292)

test('Accept: no privacy tick, a bad name and a withdrawn record have their own message', () => {
  assert.equal(acceptErrorKey('notice_not_accepted'), 'register.acceptErrors.noNotice');
  assert.equal(acceptErrorKey('name_invalid'), 'register.acceptErrors.nameInvalid');
  assert.equal(acceptErrorKey('name_too_long'), 'register.acceptErrors.nameInvalid');
  assert.equal(acceptErrorKey('student_withdrawn'), 'common.studentWithdrawn');
  assert.equal(acceptErrorKey('minor_needs_desk'), 'register.acceptErrors.minor', 'the older codes still map');
  assert.equal(acceptErrorKey('Failed to fetch'), 'common.networkError');
  assert.equal(acceptErrorKey('something new'), 'common.genericError');
  assertWorded('register.acceptErrors.noNotice', 'register.acceptErrors.nameInvalid', 'common.studentWithdrawn');
});

test('Save on the desk form: the 0047 name, gender and consent codes have their own message', () => {
  assert.equal(registerErrorKey('name_invalid'), 'register.errors.nameInvalid');
  assert.equal(registerErrorKey('name_too_long'), 'validation.nameTooLong');
  assert.equal(registerErrorKey('gender_unknown'), 'register.errors.genderUnknown');
  assert.equal(registerErrorKey('consent_guardian_mismatch'), 'register.errors.consentRefused');
  assert.equal(registerErrorKey('consent_method_not_allowed'), 'register.errors.consentRefused');
  assert.equal(registerErrorKey('student_withdrawn'), 'common.studentWithdrawn');
  assert.equal(registerErrorKey('guardian_email_on_minor'), 'register.errors.guardianEmailOnMinor');
  assert.equal(registerErrorKey('new row violates check constraint "students_pincode_check"', '23514'), 'register.errors.pincodeInvalid');
  assertWorded('register.errors.nameInvalid', 'validation.nameTooLong', 'register.errors.genderUnknown', 'register.errors.consentRefused');
});

test('a withdrawn student is worded everywhere the shared fallback is used (0048 #281)', () => {
  assert.equal(fallbackErrorKey('student_withdrawn'), 'common.studentWithdrawn');
  assert.equal(fallbackErrorKey('Network request failed'), 'common.networkError');
  for (const file of ['promotion', 'assessments', 'events', 'practice', 'coordinators', 'inventory']) {
    assert.match(src(`data/${file}.ts`), /return fallbackErrorKey\(message\);/, `${file}.ts ends with the shared fallback`);
  }
});

test('an adult registered at the desk keeps the privacy notice: the sign-up\'s, else the one shown (#290, #292)', () => {
  assert.match(src('data/students.ts'), /p_notice_version: minor \? PRIVACY_NOTICE_VERSION : adultNotice/);
  assert.match(src('app/staff/register.tsx'), /fromSignUp\?\.notice_version \?\? \(adultNoticeShown \? PRIVACY_NOTICE_VERSION : null\)/);
  assertWorded('register.adultNoticeShown', 'register.adultNoticeFromSignUp');
});

test('a sign-up the database refuses gets the staff-name hint, not "Something went wrong"', () => {
  assert.match(src('auth/auth-actions.ts'), /database error saving new user/i);
  assert.match(src('auth/auth-actions.ts'), /errorKey: signUpErrorKey\(error\)/);
  assertWorded('authErrors.signUpRefused');
  assert.match(text('en', 'authErrors.signUpRefused'), /Guru's or a coordinator's/);
});

// ---------------------------------------------------------------- R1-01, R1-03 wording

test("the desk's email hint no longer promises a child a login; the waiting screen sends people to the desk", () => {
  for (const lang of ['en', 'te', 'hi']) {
    assert.ok(text(lang, 'register.emailHintMinor'), `${lang}: register.emailHintMinor`);
    assert.doesNotMatch(text(lang, 'pending.body'), /facilitator|గురువుగారు|गुरुजी/, `${lang}: pending.body`);
    assert.doesNotMatch(text(lang, 'pending.studentHint'), /Guru|గురువుగారి|गुरुजी/, `${lang}: pending.studentHint`);
  }
  assert.match(text('en', 'register.emailHintMinor'), /not linked to an app login/);
  assert.match(text('en', 'register.emailHintMinor'), /printed QR card/);
  assert.match(text('en', 'pending.body'), /class desk/);
  assert.match(text('en', 'pending.studentHint'), /Check again/);
  assert.match(src('app/staff/register.tsx'), /minor \? 'register\.emailHintMinor' : 'register\.emailHint'/);
});

// ---------------------------------------------------------------- R2-04 / R5-03 the scan (#293)

test('a scan shows Checking… and offers no next scan until its answer', () => {
  const screen = src('app/staff/(tabs)/attendance.tsx');
  assert.match(screen, /setChecking\(true\)/);
  assert.match(screen, /scanPaused && !checking \?/);
  assert.match(screen, /if \(working\.current\) \{\s*setDroppedScan\(true\);/);
  assert.match(src('lib/attendance-location.ts'), /NO_FIX_RETRY_MS/);
  assertWorded('attendance.checkingTitle', 'attendance.checkingBody', 'attendance.waitForLast', 'attendance.alreadyIn');
});

// ---------------------------------------------------------------- R4-03 the crash screen (#294)

test('only a downloaded update crashing in its first seconds goes to expo-updates, once per update', () => {
  const crash = { updatesOn: true, embeddedLaunch: false, updateId: 'u-1', msSinceStart: 2_000, handedOverFor: null };
  assert.equal(handOverToUpdates(crash), true);
  assert.equal(handOverToUpdates({ ...crash, handedOverFor: 'u-0' }), true, 'an older update was handed over before');
  assert.equal(handOverToUpdates({ ...crash, handedOverFor: 'u-1' }), false, 'the same update again: the crash screen, no crash loop');
  assert.equal(handOverToUpdates({ ...crash, msSinceStart: STARTUP_WINDOW_MS }), false, 'later than the start: the crash screen');
  assert.equal(handOverToUpdates({ ...crash, embeddedLaunch: true }), false, "the APK's own JavaScript has nothing to go back to");
  assert.equal(handOverToUpdates({ ...crash, updateId: null }), false);
  assert.equal(handOverToUpdates({ ...crash, updatesOn: false }), false, 'the web and development');
  assert.ok(STARTUP_WINDOW_MS < 10_000, "inside expo-updates' 10 s after the first render");
});

test('Restart the app reloads the page on the web and the JavaScript on the phone, and never throws', async () => {
  let reloads = 0;
  globalThis.__testOS = 'web';
  globalThis.window = { location: { reload: () => void (reloads += 1) } };
  await restartApp();
  assert.equal(reloads, 1);
  globalThis.__testOS = 'android';
  const before = updates.reloads;
  await restartApp();
  assert.equal(updates.reloads, before + 1);
  globalThis.__reloadFails = true;
  await assert.doesNotReject(restartApp());
  globalThis.__reloadFails = false;
  globalThis.__testOS = undefined;
  globalThis.window = undefined;
});

test('the crash screen offers Restart, a downloaded fix, and hands start-up crashes over', () => {
  const screen = src('components/crash-screen.tsx');
  assert.match(screen, /label=\{t\('crash\.restart'\)\}/);
  assert.match(screen, /restartApp\(\)/);
  assert.match(screen, /<UpdateNotice \/>/);
  assert.match(screen, /checkForUpdateNow\(\)/);
  assert.match(screen, /useState\(startupCrashGoesToUpdates\)/);
  assert.match(src('lib/app-update.web.ts'), /export function startupCrashGoesToUpdates\(\): boolean \{\s*return false;/);
  assert.match(src('app/_layout.tsx'), /<CrashScreen \{\.\.\.props\} \/>/);
  assertWorded('crash.restart', 'crash.report');
});

// ---------------------------------------------------------------- FF-02 the import preview

test('a one-letter name in an import is "too short", not "signs"', () => {
  assert.equal(checkPersonName('A', { max: 100 }), 'tooShort');
  assert.match(src('data/student-import.ts'), /nameProblem === 'tooShort'\) problems\.push\('name_too_short'\)/);
  assertWorded('importErrors.name_too_short');
  assert.doesNotMatch(text('en', 'importErrors.name_signs'), /fewer than two/);
});
