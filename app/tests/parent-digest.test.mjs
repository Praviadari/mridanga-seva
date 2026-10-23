// Unit tests for the weekly email to parents (migration 0058, docs/DECISIONS.md #530-#539): the staff data calls (the
// parent's yes with the notice version, Send again, the Guru's switch, the preview through notify-parents), the
// database's answers as messages, the strings in all three languages, and the screens wired to the right pieces.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const digest = await import('../src/data/parent-digest.ts');
const { PRIVACY_NOTICE_VERSION } = await import('../src/lib/privacy-notice.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

/** A fake client recording RPC and function calls; `answers` by name. */
function fakeClient(answers = {}) {
  const calls = [];
  const answer = (name, args) => {
    calls.push({ name, args });
    const a = answers[name];
    return Promise.resolve(typeof a === 'function' ? a(args) : (a ?? { data: null, error: null }));
  };
  return {
    calls,
    client: { rpc: (name, args) => answer(name, args), functions: { invoke: (name, options) => answer(`fn:${name}`, options) } },
  };
}

test('the guardian lines: blocks as the app knows them; an unknown one reads as not eligible', async () => {
  assert.equal(digest.digestBlockOf(null), null);
  assert.equal(digest.digestBlockOf('no_digest_consent'), 'no_digest_consent');
  assert.equal(digest.digestBlockOf('something_newer'), 'not_eligible');
  const fake = fakeClient({ guardian_digest_status: { data: [{ guardian_id: 'g1', block: null, consent_at: '2026-10-23T05:00:00Z', last_sent_at: null, last_outcome: 'skipped' }], error: null } });
  globalThis.__testSupabase = fake.client;
  const map = await digest.fetchGuardianDigests('s1');
  assert.deepEqual(map.get('g1'), { guardianId: 'g1', block: null, consentAt: '2026-10-23T05:00:00Z', lastSentAt: null, lastOutcome: 'skipped' });
  globalThis.__testSupabase = fakeClient({ guardian_digest_status: { data: null, error: { code: 'PGRST202', message: 'x' } } }).client;
  assert.equal(await digest.fetchGuardianDigests('s1'), 'missing', 'before 0058 the lines stay hidden');
  delete globalThis.__testSupabase;
});

test('the parent\'s yes carries the notice version; withdrawing does not; Send again', async () => {
  const fake = fakeClient();
  globalThis.__testSupabase = fake.client;
  assert.equal(await digest.saveGuardianDigest('g1', true), undefined);
  assert.equal(await digest.saveGuardianDigest('g1', false), undefined);
  assert.equal(await digest.resendGuardianDigest('g1'), undefined);
  assert.deepEqual(fake.calls.map((c) => [c.name, c.args]), [
    ['set_guardian_digest', { p_guardian: 'g1', p_on: true, p_notice_version: PRIVACY_NOTICE_VERSION }],
    ['set_guardian_digest', { p_guardian: 'g1', p_on: false, p_notice_version: null }],
    ['resend_parent_digest', { p_guardian: 'g1' }],
  ]);
  globalThis.__testSupabase = fakeClient({ resend_parent_digest: { data: null, error: { message: 'digest_again_too_soon' } } }).client;
  assert.equal(await digest.resendGuardianDigest('g1'), 'parentDigest.errors.againTooSoon');
  delete globalThis.__testSupabase;
});

test('the database\'s answers become messages', () => {
  assert.equal(digest.digestErrorKey('no_email'), 'parentDigest.errors.noEmail');
  assert.equal(digest.digestErrorKey('not_a_minor'), 'parentDigest.errors.notMinor');
  assert.equal(digest.digestErrorKey('data_consent_required'), 'parentDigest.errors.noDataConsent');
  assert.equal(digest.digestErrorKey('digest_blocked'), 'parentDigest.errors.blocked');
  assert.equal(digest.digestErrorKey('student_withdrawn'), 'common.studentWithdrawn');
  assert.equal(digest.digestErrorKey('not_allowed'), 'parentNotices.notAllowed');
  assert.equal(digest.digestErrorKey('Failed to fetch'), 'common.networkError');
});

test('the switch and the preview: set_parent_digest; notify-parents builds the email (never a direct send)', async () => {
  const overview = { enabled: true, limits: { per_run: 10, digest_day: 100, app_day: 240, send_from: '07:00', send_until: '21:30', expire_hours: 48 },
    last_week: '2026-10-12', this_week: '2026-10-19', parents: { gets_it: 2 }, week_rows: null, digests_today: 0, app_mails_today: 3, job_at: null, job_result: 'off' };
  const email = { subject: 'S', text: 'T', html: '<p>T</p>' };
  const fake = fakeClient({
    set_parent_digest: { data: overview, error: null },
    'fn:notify-parents': { data: { enabled: true, guardians: [{ guardian_id: 'g1', block: null, language: 'te' }], emails: { te: email } }, error: null },
  });
  globalThis.__testSupabase = fake.client;
  const switched = await digest.switchDigest(true);
  assert.equal(switched.overview.enabled, true);
  assert.deepEqual(switched.overview.weekRows, {});
  const preview = await digest.fetchDigestPreview('s1', null);
  assert.deepEqual(preview.guardians, [{ guardianId: 'g1', block: null, language: 'te' }]);
  assert.equal(preview.emails.te.text, 'T');
  await digest.fetchDigestPreview('s1', 'hi');
  assert.deepEqual(fake.calls.slice(1).map((c) => c.args.body), [{ preview: 's1' }, { preview: 's1', language: 'hi' }]);
  globalThis.__testSupabase = fakeClient({ set_parent_digest: { data: null, error: { message: 'not_allowed' } }, 'fn:notify-parents': { data: null, error: new Error('FunctionsHttpError') } }).client;
  assert.deepEqual(await digest.switchDigest(true), { errorKey: 'admin.guruOnly' });
  assert.deepEqual(await digest.fetchDigestPreview('s1', null), { errorKey: 'parentDigest.previewFailed' }, 'an old notify-parents: a clear message');
  delete globalThis.__testSupabase;
});

test('every string in en, te and hi; the consent scope has a name', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const en = keys(locale('en').parentDigest).sort();
  for (const lang of ['te', 'hi']) assert.deepEqual(keys(locale(lang).parentDigest).sort(), en, lang);
  for (const lang of ['en', 'te', 'hi']) assert.ok(locale(lang).consentScopes.digest, lang);
  const used = [...src('components/guardian-digest.tsx').matchAll(/parentDigest\.([a-zA-Z.]+)/g), ...src('app/staff/parent-digest.tsx').matchAll(/parentDigest\.([a-zA-Z.]+)/g)]
    .map((m) => m[1].replace(/\.$/, '')).filter((k) => !['blocks', 'reasons', 'outcomes', 'jobResults', 'done'].includes(k));
  for (const key of used) assert.ok(en.includes(key), `parentDigest.${key} is in en.json`);
  for (const lang of ['en', 'te', 'hi']) {
    for (const [key, text] of Object.entries(locale(lang).parentDigest.reasons)) assert.match(text, /\{\{n\}\}/, `${lang} reasons.${key}`);
  }
});

test('the screens: the student page has the lines and the preview; G10 links the screen; only the Guru switches', () => {
  const profile = src('app/staff/students/[id].tsx');
  assert.match(profile, /<GuardianDigestLine digest=\{digests\?\.get\(g\.id\)\} onChanged=\{reloadDigests\} \/>/);
  assert.match(profile, /pathname: '\/staff\/parent-digest', params: \{ student: student\.id \}/);
  assert.match(src('app/staff/settings.tsx'), /router\.push\('\/staff\/parent-digest'\)/);
  const screen = src('app/staff/parent-digest.tsx');
  assert.match(screen, /const guru = profile\?\.role === 'guru';/);
  assert.match(screen, /\{guru \? \(\s*<Button/, 'the switch button only for the Guru');
  assert.match(screen, /confirmReady\(\)/, 'switching asks once more and ignores a double tap');
  const line = src('components/guardian-digest.tsx');
  assert.match(line, /if \(kind === 'yes' && !confirmReady\(\)\) return;/, 'recording the yes asks once more');
});
