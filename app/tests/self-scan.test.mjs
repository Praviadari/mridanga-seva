// Face self-scan (Phase 3 P3-5, docs/DECISIONS.md #344-#349): the phone's rules in src/face/self-scan-rules.ts —
// the location result it binds into the integrity token (must equal the server's self_scan_location, 0071),
// the refusals (outside, accuracy over 100 m, mocked, no position, no centre point), the check-out that is
// never refused for the place, the 1:1 decision, the three tries, and reading the server's answers. The
// server's own checks are in supabase/tests/smoke-test.mjs (0071 block).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const R = await import('../src/face/self-scan-rules.ts');
const M = await import('../src/face/face-math.ts');
const S = await import('../src/face/face-settings.ts');

const AREA = { lat: 17.385, lng: 78.4867, radius_m: 100 };
const fix = (over = {}) => ({ status: 'fix', lat: 17.385, lng: 78.4867, accuracy: 12, mocked: false, ...over });
const north = (m) => 17.385 + m / 111195; // metres north of the centre's point

test('distance: the haversine of 0024 / 0071 (about 1.11 km for 0.01 degree of latitude)', () => {
  assert.equal(Math.round(R.distanceM(17.385, 78.4867, 17.395, 78.4867)), 1112);
  assert.equal(R.distanceM(17.385, 78.4867, 17.385, 78.4867), 0);
});

test('inside: within radius + accuracy, as the server (0071 smoke: 150 m with 60 m accuracy is inside, with 40 m outside)', () => {
  assert.deepEqual(R.locationResult(fix(), AREA), { result: 'inside', distanceM: 0 });
  assert.equal(R.locationResult(fix({ lat: north(150), accuracy: 60 }), AREA).result, 'inside');
  assert.equal(R.locationResult(fix({ lat: north(150), accuracy: 40 }), AREA).result, 'outside');
  assert.equal(R.locationResult(fix({ lat: north(150), accuracy: 40 }), AREA).distanceM, 150);
  assert.equal(R.locationResult(fix({ lat: 17.395 }), AREA).result, 'outside');
});

test('refusals before the distance: mocked, accuracy over 100 m or none, no centre point, no position', () => {
  assert.equal(R.locationResult(fix({ mocked: true }), AREA).result, 'mocked');
  // A mocked position is refused even when it claims to be at the centre with perfect accuracy.
  assert.equal(R.locationResult(fix({ mocked: true, accuracy: 1 }), AREA).result, 'mocked');
  assert.equal(R.locationResult(fix({ accuracy: 101 }), AREA).result, 'inaccurate');
  assert.equal(R.locationResult(fix({ accuracy: 100 }), AREA).result, 'inside');
  assert.equal(R.locationResult(fix({ accuracy: null }), AREA).result, 'inaccurate');
  assert.equal(R.locationResult(fix({ accuracy: -1 }), AREA).result, 'inaccurate');
  assert.equal(R.locationResult(fix(), null).result, 'no_area');
  for (const status of ['refused', 'no_fix', 'no_location']) {
    assert.deepEqual(R.locationResult({ status }, AREA), { result: status, distanceM: null });
  }
});

test('check-in only from inside; check-out always goes on (outside = saved and flagged)', () => {
  for (const result of ['outside', 'refused', 'no_fix', 'no_location', 'no_area', 'mocked', 'inaccurate']) {
    assert.equal(R.locationAllows('check_in', result), false, result);
    assert.equal(R.locationAllows('check_out', result), true, result);
  }
  assert.equal(R.locationAllows('check_in', 'inside'), true);
});

test('a refused location is counted as outside (with the detail) or mocked; inside is no failure', () => {
  assert.equal(R.locationFailure('inside'), null);
  assert.deepEqual(R.locationFailure('mocked'), { reason: 'mocked', detail: null });
  assert.deepEqual(R.locationFailure('inaccurate'), { reason: 'outside', detail: 'inaccurate' });
  assert.deepEqual(R.locationFailure('no_fix'), { reason: 'outside', detail: 'no_fix' });
});

test('the request text is 0070\'s, letter for letter (verify-integrity/verdict.ts requestText)', () => {
  assert.equal(R.selfScanRequestText('u-1', 'check_out', 'ab'.repeat(16), 'outside'), `mrdg-selfscan-v1|u-1|check_out|${'ab'.repeat(16)}|outside`);
});

const unit = (i) => {
  const v = new Float32Array(128);
  v[i] = 1;
  return v;
};
const mix = (a, b, w) => M.l2normalize(a.map((x, i) => x * (1 - w) + b[i] * w));

test('the 1:1 decision: all real, one face, mean close to the phone\'s code at the threshold', () => {
  const me = unit(0);
  const other = unit(1);
  const limits = { minFrames: 3, liveMin: S.LIVE_SCORE_MIN, selfMin: S.SELF_MATCH_MIN, matchMin: S.MATCH_MIN };
  const mine = [0.1, 0.15, 0.2].map((w) => ({ embedding: mix(me, other, w), realScore: 0.95 }));
  const ok = R.verifyScan(mine, me, limits);
  assert.equal(ok.ok, true);
  assert.ok(ok.score > 0.9);
  assert.deepEqual(R.verifyScan(mine.slice(0, 2), me, limits), { ok: false, problem: 'tooFew', score: null });
  assert.equal(R.verifyScan([...mine.slice(0, 2), { ...mine[2], realScore: 0.5 }], me, limits).problem, 'liveness');
  // Two pictures of the student and one of a third person (someone stepping in): not one face.
  const twoAndOne = [me, me, unit(2)].map((embedding) => ({ embedding, realScore: 0.95 }));
  assert.equal(R.verifyScan(twoAndOne, me, limits).problem, 'notOneFace');
  const someoneElse = [0.9, 0.85, 0.95].map((w) => ({ embedding: mix(me, other, w), realScore: 0.95 }));
  const no = R.verifyScan(someoneElse, me, limits);
  assert.equal(no.ok, false);
  assert.equal(no.problem, 'noMatch');
  assert.ok(no.score < S.MATCH_MIN);
});

test('the threshold: the server\'s when stricter, never below the app\'s own', () => {
  assert.equal(R.matchThreshold(0.55, 0.6), 0.6);
  assert.equal(R.matchThreshold(0.55, 0.4), 0.55);
  assert.equal(R.matchThreshold(0.55, null), 0.55);
  assert.equal(R.matchThreshold(0.55, 1.2), 0.55);
  assert.equal(S.MATCH_MIN, 0.55); // = 0071's face_match_percent 55
});

test('three failed tries in a day, then only the coordinator; a new day starts again', () => {
  let tries = null;
  for (let i = 0; i < 2; i++) tries = R.addTry(tries, '2027-03-20');
  assert.equal(R.triesUsedUp(tries, '2027-03-20', S.MAX_SELF_SCAN_TRIES), false);
  tries = R.addTry(tries, '2027-03-20');
  assert.equal(R.triesUsedUp(tries, '2027-03-20', S.MAX_SELF_SCAN_TRIES), true);
  assert.equal(R.triesUsedUp(tries, '2027-03-21', S.MAX_SELF_SCAN_TRIES), false);
  assert.deepEqual(R.addTry(tries, '2027-03-21'), { day: '2027-03-21', count: 1 });
  // Place and time say "ask a coordinator" at once; they are not tries.
  for (const reason of ['window', 'outside', 'mocked', 'not_checked_in', 'too_soon', 'not_enrolled']) assert.equal(R.countsAsTry(reason), false, reason);
  for (const reason of ['integrity', 'liveness', 'no_match', 'noMatch', 'notOneFace', 'tooFew']) assert.equal(R.countsAsTry(reason), true, reason);
  assert.equal(R.faceFailureReason('noMatch'), 'no_match');
  assert.equal(R.faceFailureReason('notOneFace'), 'liveness');
});

test('self_scan_state: the circle, the centre, the threshold (numbers may come as text)', () => {
  const s = R.readSelfScanState({ face_enabled: true, enrolled: true, action: 'check_in', open_now: true, opens_at: '14:30', closes_at: '20:00',
    checked_in_at: null, centre: { lat: 17.385, lng: '78.4867', radius_m: 100 }, match_min: '0.55', blocked: null });
  assert.deepEqual(s, { faceEnabled: true, enrolled: true, action: 'check_in', openNow: true, opensAt: '14:30', closesAt: '20:00',
    checkedInAt: null, centre: { lat: 17.385, lng: 78.4867, radius_m: 100 }, matchMin: 0.55, blocked: null });
  const off = R.readSelfScanState({ face_enabled: false, enrolled: false, action: null });
  assert.equal(off.action, null);
  assert.equal(off.centre, null);
  assert.equal(R.readSelfScanState({ action: 'check_in' }), null);
  assert.equal(R.readSelfScanState({ face_enabled: true, action: 'enter' }).action, null);
});

test('self_scan\'s answers: saved (check-out flagged), and the answered refusals', () => {
  assert.deepEqual(R.readSelfScanOutcome({ ok: true, action: 'out', at: '2027-03-20T13:00:00Z', flagged: true, location: 'outside', minutes: 40 }),
    { kind: 'out', at: '2027-03-20T13:00:00Z', flagged: true, location: 'outside', minutes: 40 });
  assert.equal(R.readSelfScanOutcome({ ok: true, action: 'in', at: 'x', flagged: false, location: 'inside' }).flagged, false);
  assert.deepEqual(R.readSelfScanOutcome({ ok: false, reason: 'too_soon', minutes: 10 }), { kind: 'refused', reason: 'too_soon', detail: null, minutes: 10 });
  assert.deepEqual(R.readSelfScanOutcome({ ok: false, reason: 'outside', detail: 'inaccurate' }), { kind: 'refused', reason: 'outside', detail: 'inaccurate', minutes: null });
  assert.equal(R.readSelfScanOutcome({ ok: false, reason: 'something_new' }).reason, 'other');
  assert.equal(R.readSelfScanOutcome({ ok: true, action: 'teleport' }), null);
  assert.equal(R.readSelfScanOutcome(null), null);
});

test('settings: one location read of at most 8 s, 3 pictures, 3 tries; no Cloud project yet (not_configured)', () => {
  assert.equal(S.LOCATION_TIMEOUT_MS, 8000);
  assert.equal(S.VERIFY_FRAMES, 3);
  assert.equal(S.MAX_SELF_SCAN_TRIES, 3);
  assert.equal(S.PLAY_INTEGRITY_CLOUD_PROJECT, '');
});

// ---------------------------------------------------------------- guards against drift (app ↔ 0071 ↔ verify-integrity)
const fs = await import('node:fs');
const path = await import('node:path');
const F = await import('../src/data/face.ts');
const app = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(app, '..');
const read = (p) => fs.readFileSync(path.join(app, p), 'utf8');
const sql64 = fs.readFileSync(path.join(repo, 'supabase/migrations/0071_face_selfscan.sql'), 'utf8');
const code = (text) => text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, '');

test('0071: every code self_scan raises to the app has a message; every answered refusal has its text', () => {
  const raised = new Set([...sql64.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]));
  const notForTheApp = new Set(['setting_required', 'setting_invalid', 'setting_unknown', 'setting_owner_only', 'location_locked', 'face_visit_reserved']);
  // own_record: 0053's refuse_own_record, replaced in 0071 (#434); the shared message (data/errors.ts).
  assert.equal(F.faceErrorKey('own_record'), 'common.ownRecord');
  assert.deepEqual([...raised].filter((c) => c !== 'own_record' && !notForTheApp.has(c) && !F.FACE_ERROR_CODES.includes(c)), []);
  const failCase = sql64.slice(sql64.indexOf('v_fail := case'), sql64.indexOf('end;', sql64.indexOf('v_fail := case')));
  const answered = [...failCase.matchAll(/then '([a-z_]+)'/g)].map((m) => m[1]);
  assert.equal(answered.length, 7);
  const en = JSON.parse(read('src/i18n/locales/en.json'));
  for (const reason of new Set([...answered, 'integrity', 'not_checked_in', 'too_soon', 'other'])) {
    assert.ok(en.selfScan.refused.server[reason], `selfScan.refused.server.${reason}`);
  }
  for (const result of ['outside', 'refused', 'no_fix', 'no_location', 'no_area', 'mocked', 'inaccurate']) {
    assert.ok(en.selfScan.refused.location[result], `selfScan.refused.location.${result}`);
    assert.ok(en.attendanceLocation.outReason[result], `attendanceLocation.outReason.${result}`);
    assert.match(sql64, new RegExp(`'${result}'`), `0071 knows ${result}`);
  }
  for (const problem of ['tooFew', 'liveness', 'notOneFace', 'noMatch']) assert.ok(en.selfScan.refused.face[problem], problem);
});

test('te and hi have every self-scan and staff-count text en has (drafts for native review)', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const en = JSON.parse(read('src/i18n/locales/en.json'));
  for (const lang of ['te', 'hi']) {
    const other = JSON.parse(read(`src/i18n/locales/${lang}.json`));
    for (const group of ['selfScan', 'faceCounts']) assert.deepEqual(keys(other[group]).sort(), keys(en[group]).sort(), `${lang} ${group}`);
  }
});

test('the request text and the accuracy limit are the server\'s', () => {
  const verdict = fs.readFileSync(path.join(repo, 'supabase/functions/verify-integrity/verdict.ts'), 'utf8');
  assert.match(verdict, /REQUEST_PREFIX = 'mrdg-selfscan-v1'/);
  assert.match(verdict, /`\$\{REQUEST_PREFIX\}\|\$\{login\}\|\$\{action\}\|\$\{challenge\}\|\$\{location\}`/);
  assert.equal(R.MAX_ACCURACY_M, 100);
  assert.match(sql64, /v_acc > 100/);
  assert.match(sql64, /v_dist <= c\.radius_m \+ v_acc then 'inside'/);
});

test('Gate 2 and #212: the self-scan sends a score and one position, never a face code; no position is kept on the phone', () => {
  const data = code(read('src/data/self-scan.ts'));
  for (const word of ['mean', 'embedding', 'template', 'floatsToBase64']) assert.doesNotMatch(data, new RegExp(`\\b${word}\\b`), word);
  const where = code(read('src/face/self-scan-location.ts'));
  assert.doesNotMatch(where, /getLastKnownPositionAsync|watchPositionAsync|startLocationUpdatesAsync|setItem|writeStoredFace/);
  assert.match(where, /LOCATION_TIMEOUT_MS/);
});

test('nothing shows while face scan is off, on the web, or on a phone without a face code', () => {
  const hook = read('src/face/use-self-scan.ts');
  assert.match(hook, /status\?\.server\?\.face_enabled === true && status\.stored\?\.enrolled/);
  assert.match(read('src/face/integrity.web.ts'), /SELF_SCAN_SUPPORTED = false/);
  assert.match(read('src/face/integrity.ts'), /SELF_SCAN_SUPPORTED = Platform\.OS === 'android'/);
  assert.match(read('src/app/student/(tabs)/index.tsx'), /\.\.\.\(selfScanAction\s*\?/);
  // The staff counts entry checks the server switch too.
  assert.match(read('src/components/face-entries.tsx'), /export function FaceCountsEntry[\s\S]{0,300}if \(!on\) return null/);
});

test('the coordinator\'s way is on every step of the self-scan page', () => {
  const page = read('src/app/student/self-scan.tsx');
  assert.ok((page.match(/<AskCoordinator \/>/g) ?? []).length >= 3);
  // The stack copy of My QR, not the tab address (#301: a screen on top of the tabs never opens a tab).
  assert.match(page, /router\.replace\('\/student\/qr'\)/);
});