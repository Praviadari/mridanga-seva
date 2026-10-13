// Face scan (Phase 3 P3-4, docs/DECISIONS.md #307-#312): the enrolment state machine and the wipe rule of the
// face code on the phone (src/face/enrolment.ts), the server's error codes worded (src/data/face.ts), and the
// guards that keep face scan off by default, device-only and out of the web bundle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import './stubs/register.mjs';

const E = await import('../src/face/enrolment.ts');
const S = await import('../src/face/face-settings.ts');
const F = await import('../src/data/face.ts');

const app = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(app, '..');
const read = (p) => fs.readFileSync(path.join(app, p), 'utf8');

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const KEY = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const NOW = Date.parse('2026-10-13T10:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;

const part = (o = {}) => ({ request: 7, mean: 'AAAA', frames: 5, createdAt: iso(NOW - 60_000), ...o });
const stored = (o = {}) => ({ v: 1, profileId: ME, deviceKey: KEY, model: S.FACE_MODEL_VERSION, enrolled: null, pending: null, ...o });
const server = (o = {}) => ({
  face_enabled: true,
  model_version: S.FACE_MODEL_VERSION,
  enrolled: false,
  expires_at: null,
  waiting_request: null,
  confirmed: false,
  ...o,
});

// ---------------------------------------------------------------- the wipe rule

test('wipe rule: nothing kept → nothing to do', () => {
  assert.deepEqual(E.applyWipeRule(null, server(), ME, NOW), { next: null, changed: false, reason: 'nothing' });
});

test("wipe rule: another login's face code goes, whatever the server says", () => {
  const r = E.applyWipeRule(stored({ enrolled: part() }), server({ enrolled: true }), OTHER, NOW);
  assert.deepEqual([r.next, r.changed, r.reason], [null, true, 'otherLogin']);
});

test('wipe rule: a code from another model goes (app model or server model)', () => {
  const old = E.applyWipeRule(stored({ model: 'sface-old', enrolled: part() }), server({ enrolled: true }), ME, NOW);
  assert.deepEqual([old.next, old.reason], [null, 'model']);
  const changed = E.applyWipeRule(stored({ enrolled: part() }), server({ enrolled: true, model_version: 'sface-2027' }), ME, NOW);
  assert.deepEqual([changed.next, changed.reason], [null, 'model']);
});

test('wipe rule: enrolled is kept while the server says this phone is current, else wiped (S4F-02/06)', () => {
  const s = stored({ enrolled: part({ expiresAt: '2028-10-13T10:00:00Z' }) });
  const kept = E.applyWipeRule(s, server({ enrolled: true, expires_at: '2028-10-13T10:00:00Z' }), ME, NOW);
  assert.deepEqual([kept.next, kept.changed, kept.reason], [s, false, 'kept']);
  const ended = E.applyWipeRule(s, server({ enrolled: false }), ME, NOW);
  assert.deepEqual([ended.next, ended.changed, ended.reason], [null, true, 'ended']);
  // Also while face scan is switched off: the server still answers for the enrolment (#300).
  const offKept = E.applyWipeRule(s, server({ face_enabled: false, enrolled: true, expires_at: '2028-10-13T10:00:00Z' }), ME, NOW);
  assert.equal(offKept.reason, 'kept');
  const offEnded = E.applyWipeRule(s, server({ face_enabled: false, enrolled: false }), ME, NOW);
  assert.equal(offEnded.next, null);
});

test('wipe rule: a new end date from the server is copied (synced)', () => {
  const r = E.applyWipeRule(stored({ enrolled: part({ expiresAt: 'a' }) }), server({ enrolled: true, expires_at: 'b' }), ME, NOW);
  assert.deepEqual([r.changed, r.reason, r.next.enrolled.expiresAt], [true, 'synced', 'b']);
});

test('wipe rule: pending is kept while the server waits on that request; dropped when it does not', () => {
  const s = stored({ pending: part({ request: 9, code: '123456' }) });
  const waits = E.applyWipeRule(s, server({ waiting_request: 9 }), ME, NOW);
  assert.deepEqual([waits.next, waits.reason], [s, 'kept']);
  const gone = E.applyWipeRule(s, server({ waiting_request: null }), ME, NOW);
  assert.deepEqual([gone.next, gone.reason], [null, 'requestEnded']);
  const another = E.applyWipeRule(s, server({ waiting_request: 10 }), ME, NOW);
  assert.equal(another.next, null);
});

test('wipe rule: a pending the server already enrolled (app stopped after enrol_face) is promoted', () => {
  const s = stored({ pending: part({ request: 9, code: '123456' }) });
  const r = E.applyWipeRule(s, server({ enrolled: true, expires_at: '2028-10-13T10:00:00Z' }), ME, NOW);
  assert.equal(r.reason, 'promoted');
  assert.equal(r.next.pending, null);
  assert.deepEqual(r.next.enrolled, { request: 9, mean: 'AAAA', frames: 5, createdAt: s.pending.createdAt, expiresAt: '2028-10-13T10:00:00Z' });
});

test('wipe rule: re-enrolment — the old enrolment stays while the new waits; the new one replaces it once enrolled', () => {
  const old = part({ request: 3, mean: 'OLD', expiresAt: '2026-11-01T00:00:00Z' });
  const s = stored({ enrolled: old, pending: part({ request: 9, mean: 'NEW', code: '654321' }) });
  // The server still waits on 9 and the old one is current.
  const waiting = E.applyWipeRule(s, server({ enrolled: true, expires_at: old.expiresAt, waiting_request: 9 }), ME, NOW);
  assert.deepEqual([waiting.next, waiting.reason], [s, 'kept']);
  // 9 was enrolled: a new end date → the new code is promoted, the old one replaced.
  const done = E.applyWipeRule(s, server({ enrolled: true, expires_at: '2028-10-13T00:00:00Z' }), ME, NOW);
  assert.deepEqual([done.reason, done.next.enrolled.mean, done.next.pending], ['promoted', 'NEW', null]);
  // 9 ended without enrolling (wrong code 5 times): the old one stays, the new code goes.
  const failed = E.applyWipeRule(s, server({ enrolled: true, expires_at: old.expiresAt }), ME, NOW);
  assert.deepEqual([failed.reason, failed.next.enrolled.mean, failed.next.pending], ['requestEnded', 'OLD', null]);
});

test('wipe rule: no answer (offline) keeps everything, except a pending older than an hour', () => {
  const s = stored({ enrolled: part(), pending: part({ request: 9 }) });
  assert.deepEqual(E.applyWipeRule(s, null, ME, NOW), { next: s, changed: false, reason: 'kept' });
  const stale = stored({ pending: part({ request: 9, createdAt: iso(NOW - S.PENDING_MAX_MS - 1) }) });
  assert.deepEqual(E.applyWipeRule(stale, null, ME, NOW), { next: null, changed: true, reason: 'stalePending' });
  const staleWithEnrolled = stored({ enrolled: part(), pending: part({ request: 9, createdAt: iso(NOW - S.PENDING_MAX_MS - 1) }) });
  const r = E.applyWipeRule(staleWithEnrolled, null, ME, NOW);
  assert.deepEqual([r.reason, r.next.pending, r.next.enrolled !== null], ['stalePending', null, true]);
});

// ---------------------------------------------------------------- the screen's state machine

test('view: switch off + nothing kept = off; switch on + nothing = intro', () => {
  assert.deepEqual(E.faceView(null, server({ face_enabled: false }), NOW, 30), { kind: 'off' });
  assert.deepEqual(E.faceView(null, server(), NOW, 30), { kind: 'intro' });
  // No answer: the phone's own record decides (no internet note on the page).
  assert.deepEqual(E.faceView(null, null, NOW, 30), { kind: 'intro' });
});

test('view: a waiting code is shown until it runs out; confirmed beats the clock', () => {
  const s = stored({ pending: part({ request: 9, code: '123456', codeExpiresAt: iso(NOW + 5 * 60_000) }) });
  assert.deepEqual(E.faceView(s, server({ waiting_request: 9 }), NOW, 30), {
    kind: 'code', request: 9, code: '123456', expired: false, confirmed: false, reEnrol: false,
  });
  assert.equal(E.faceView(s, server({ waiting_request: 9 }), NOW + 6 * 60_000, 30).expired, true);
  const confirmed = E.faceView(s, server({ waiting_request: 9, confirmed: true }), NOW + 6 * 60_000, 30);
  assert.deepEqual([confirmed.confirmed, confirmed.expired], [true, false]);
  // A confirmation of another request does not count.
  assert.equal(E.faceView(s, server({ waiting_request: 8, confirmed: true }), NOW, 30).confirmed, false);
});

test('view: on, with the re-enrol prompt 30 days before the end; class switch off still shows it (to turn off)', () => {
  const s = stored({ enrolled: part({ expiresAt: iso(NOW + 60 * DAY) }) });
  assert.deepEqual(E.faceView(s, server({ enrolled: true }), NOW, 30), { kind: 'on', expiresAt: iso(NOW + 60 * DAY), soon: false, classOff: false });
  assert.equal(E.faceView(s, server({ enrolled: true }), NOW + 31 * DAY, 30).soon, true);
  assert.deepEqual(E.faceView(s, server({ face_enabled: false, enrolled: true }), NOW + 31 * DAY, 30), {
    kind: 'on', expiresAt: iso(NOW + 60 * DAY), soon: false, classOff: true,
  });
  // Re-enrolment waiting: the code view, marked as a re-enrolment.
  const again = stored({ enrolled: part(), pending: part({ request: 9, code: '1', codeExpiresAt: iso(NOW + 60_000) }) });
  assert.equal(E.faceView(again, server({ enrolled: true, waiting_request: 9 }), NOW, 30).reEnrol, true);
});

test('expiresSoon', () => {
  assert.equal(E.expiresSoon(null, NOW, 30), false);
  assert.equal(E.expiresSoon('not a date', NOW, 30), false);
  assert.equal(E.expiresSoon(iso(NOW + 30 * DAY), NOW, 30), true);
  assert.equal(E.expiresSoon(iso(NOW + 30 * DAY + 1), NOW, 30), false);
  assert.equal(E.expiresSoon(iso(NOW - DAY), NOW, 30), true);
});

test('record transitions: pending after the scan, enrolled after enrol_face, dropped when stopped', () => {
  const started = { request: 9, code: '123456', expiresAt: iso(NOW + 600_000) };
  const first = E.withPending(null, ME, KEY, started, 'MEAN', 5, NOW);
  assert.deepEqual(first, {
    v: 1, profileId: ME, deviceKey: KEY, model: S.FACE_MODEL_VERSION, enrolled: null,
    pending: { request: 9, mean: 'MEAN', frames: 5, createdAt: iso(NOW), code: '123456', codeExpiresAt: started.expiresAt },
  });
  const on = E.withEnrolled(first, '2028-10-13T10:00:00Z');
  assert.deepEqual([on.pending, on.enrolled.mean, on.enrolled.expiresAt, 'code' in on.enrolled], [null, 'MEAN', '2028-10-13T10:00:00Z', false]);
  // Re-enrolment keeps the enrolled one until the new one is confirmed; another login's record is not carried.
  const again = E.withPending(on, ME, KEY, { ...started, request: 10 }, 'NEW', 4, NOW);
  assert.deepEqual([again.enrolled.mean, again.pending.request], ['MEAN', 10]);
  assert.equal(E.withPending({ ...on, profileId: OTHER }, ME, KEY, started, 'X', 3, NOW).enrolled, null);
  assert.equal(E.withoutPending(first), null);
  assert.deepEqual(E.withoutPending(again), { ...again, pending: null });
  assert.equal(E.withoutPending(null), null);
});

test('enrolment pictures: enough, all real, all one face', () => {
  const e = new Float32Array([1, 0]);
  const ok = Array.from({ length: 5 }, () => ({ embedding: e, realScore: 0.95 }));
  const limits = { minFrames: S.ENROL_FRAMES_MIN, liveMin: S.LIVE_SCORE_MIN, selfMin: S.SELF_MATCH_MIN };
  const same = () => 0.9;
  assert.equal(E.enrolmentProblem(ok, limits, same), null);
  assert.equal(E.enrolmentProblem(ok.slice(0, 2), limits, same), 'tooFew');
  assert.equal(E.enrolmentProblem([...ok.slice(0, 4), { embedding: e, realScore: 0.3 }], limits, same), 'notReal');
  assert.equal(E.enrolmentProblem([...ok.slice(0, 4), { embedding: e, realScore: Number.NaN }], limits, same), 'notReal');
  assert.equal(E.enrolmentProblem(ok, limits, () => 0.2), 'notOneFace');
  assert.ok(S.ENROL_FRAMES >= 3 && S.ENROL_FRAMES <= 5, 'WORK_PLAN P3-4: 3-5 frames');
});

test('device key: 24 random bytes give 32 characters the server accepts', () => {
  const bytes = Uint8Array.from({ length: 24 }, (_, i) => (i * 37 + 250) % 256);
  const key = E.deviceKeyFrom(bytes);
  assert.equal(key.length, 32);
  assert.ok(E.isDeviceKey(key), key);
  assert.equal(E.deviceKeyFrom(new Uint8Array(24)), 'A'.repeat(32));
  assert.equal(E.deviceKeyFrom(new Uint8Array(24).fill(255)), '_'.repeat(32));
  assert.throws(() => E.deviceKeyFrom(new Uint8Array(8)));
  assert.equal(E.isDeviceKey('short'), false);
  assert.equal(E.isDeviceKey('has space in it 1234'), false);
});

test("readServerFace reads my_face_enrolment's JSON and refuses anything else", () => {
  assert.deepEqual(
    E.readServerFace({ face_enabled: true, model_version: 'm', enrolled: null, expires_at: null, waiting_request: 4, confirmed: true }),
    { face_enabled: true, model_version: 'm', enrolled: false, expires_at: null, waiting_request: 4, confirmed: true },
  );
  assert.equal(E.readServerFace(null), null);
  assert.equal(E.readServerFace({ enrolled: true }), null);
});

// ---------------------------------------------------------------- error codes and guards

test('every face error code is worded in en/te/hi, with the shared fallback for the rest', () => {
  const langs = Object.fromEntries(['en', 'te', 'hi'].map((l) => [l, JSON.parse(read(`src/i18n/locales/${l}.json`))]));
  for (const code of F.FACE_ERROR_CODES) {
    assert.equal(F.faceErrorKey(code), `face.errors.${code}`);
    for (const [lang, json] of Object.entries(langs)) assert.equal(typeof json.face.errors[code], 'string', `${lang} ${code}`);
  }
  assert.equal(F.faceErrorKey('not_allowed', 'approve'), 'face.errors.confirmOwn');
  assert.equal(F.faceErrorKey('student_withdrawn'), 'common.studentWithdrawn');
  assert.equal(F.faceErrorKey('Failed to fetch'), 'common.networkError');
  assert.equal(F.faceErrorKey('something new'), 'common.genericError');
  assert.equal(F.faceErrorCode('no_face_consent'), 'no_face_consent');
  assert.equal(F.faceErrorCode('nope'), null);
});

test("every refusal code the server's face functions raise has a message", () => {
  const sql = fs.readFileSync(path.join(repo, 'supabase/migrations/0060_face_enrolment.sql'), 'utf8');
  const raised = new Set([...sql.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]));
  // face_block_reason's answers are raised with '%'.
  for (const m of sql.matchAll(/return '([a-z_]+)';/g)) raised.add(m[1]);
  // Raised only by the Edge Function's own calls (service role) or the server's settings guard for other keys.
  const notForTheApp = new Set(['setting_required', 'setting_invalid', 'setting_unknown', 'result_invalid', 'pass_hash_invalid', 'student_withdrawn']);
  const missing = [...raised].filter((c) => !notForTheApp.has(c) && !F.FACE_ERROR_CODES.includes(c));
  assert.deepEqual(missing, []);
});

test("the app's model version is the server's face_model_version setting", () => {
  const sql = fs.readFileSync(path.join(repo, 'supabase/migrations/0060_face_enrolment.sql'), 'utf8');
  assert.match(sql, new RegExp(`\\('face_model_version', '"${S.FACE_MODEL_VERSION}"'\\)`));
  assert.match(read('assets/models/README.md'), new RegExp(S.FACE_MODEL_VERSION));
});

test('Gate 2: no face code is ever sent — the data calls carry no mean, embedding or template', () => {
  const data = read('src/data/face.ts');
  for (const word of ['mean', 'embedding', 'template', 'floatsToBase64']) {
    assert.doesNotMatch(data.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*\*[\s\S]*?\*\//g, ''), new RegExp(`\\b${word}\\b`), word);
  }
  // The face code is written only to the Keystore-backed store.
  assert.match(read('src/face/face-store.ts'), /expo-secure-store/);
});

test('sign-out wipes the face code (every sign-out path goes through clearDeviceTraces, S4F-06)', () => {
  assert.match(read('src/lib/device-traces.ts'), /forgetFace\(\)/);
  assert.match(read('src/auth/auth-provider.tsx'), /if \(event === 'SIGNED_OUT'\)[\s\S]{0,300}clearDeviceTraces\(\)/);
});

test('the web bundle never imports the native face packages', () => {
  const native = /from '(react-native-vision-camera[^']*|react-native-fast-tflite|react-native-nitro-[a-z]+|expo-secure-store|@expo\/app-integrity)'/;
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(path.relative(app, p).replace(/\\/g, '/'));
    }
  };
  walk(path.join(app, 'src'));
  const importers = files.filter((f) => native.test(read(f)));
  // Each either has a .web twin, or is imported only by files that have one.
  const twinned = new Set(['src/face/face-scanner.tsx', 'src/face/face-dev-panel.tsx', 'src/face/face-store.ts', 'src/face/integrity.ts']);
  const insideTwinned = new Set(['src/face/face-camera.tsx', 'src/face/pipeline.ts']);
  assert.deepEqual(importers.filter((f) => !twinned.has(f) && !insideTwinned.has(f)), []);
  for (const f of twinned) assert.ok(fs.existsSync(path.join(app, f.replace(/\.(tsx?)$/, '.web.$1'))), `${f} has a .web twin`);
  for (const f of insideTwinned) {
    const name = path.basename(f).replace(/\.tsx?$/, '');
    const users = files.filter((u) => u !== f && new RegExp(`from '(\\./|@/face/)${name}'`).test(read(u)));
    assert.deepEqual(users.filter((u) => !twinned.has(u) && !insideTwinned.has(u)), [], `${f} imported only by native-only files`);
  }
});

test('face scan shows nothing while the switch is off: every entry checks the server switch', () => {
  const entries = read('src/components/face-entries.tsx');
  assert.match(entries, /face_enabled !== true\) return null/);
  assert.match(entries, /if \(!on && !status\.stored\) return null/);
  assert.match(entries, /if \(!allowed \|\| !on\) return null/);
  assert.match(entries, /if \(!on\) return null/);
  assert.match(read('src/data/face.ts'), /\.eq\('key', 'face_enabled'\)/);
});

test('app.json: camera text names the face scan, GPU library left out, no SQLCipher, no fingerprint module', () => {
  const { expo } = JSON.parse(read('app.json'));
  const plugin = (name) => expo.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name);
  assert.match(plugin('expo-camera')[1].cameraPermission, /face scan/);
  assert.deepEqual(plugin('expo-build-properties')[1].android.packagingOptions.exclude, ['**/libtensorflowlite_gpu_jni.so']);
  assert.deepEqual(plugin('expo-build-properties')[1].android.buildArchs, ['armeabi-v7a', 'arm64-v8a']);
  assert.equal(plugin('expo-sqlite'), 'expo-sqlite');
  // The APK's merged manifest (Actions run 38404377388) had these from androidx.biometric (expo-secure-store) and an
  // implied READ_PHONE_STATE (LiteRT); the class uses none of them (#307).
  for (const permission of ['READ_PHONE_STATE', 'USE_BIOMETRIC', 'USE_FINGERPRINT']) {
    assert.ok(expo.android.blockedPermissions.includes(`android.permission.${permission}`), permission);
  }
  for (const lang of ['te', 'hi']) assert.ok(JSON.parse(read(expo.locales[lang])).ios.NSCameraUsageDescription.length > 20);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['expo-local-authentication'], undefined);
  for (const [name, version] of Object.entries({
    'react-native-vision-camera': '5.2.3',
    'react-native-vision-camera-worklets': '5.2.3',
    'react-native-nitro-modules': '0.37.1',
    'react-native-nitro-image': '0.15.2',
    'react-native-vision-camera-face-detector': '2.1.0',
    'react-native-fast-tflite': '3.0.1',
    '@expo/app-integrity': '57.0.2',
  })) assert.equal(pkg.dependencies[name], version, name);
});
