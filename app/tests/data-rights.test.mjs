// Unit tests for My data and rights and the Guru's Data requests (audit 22-10-2026 fix 17, docs/DECISIONS.md
// #550-#556): the request form's rules, references and answer-by days, the summary's sections and printable page,
// the error words for every refusal of 0059, the privacy contact and reply period matching the website, and the
// small edits to My profile and the To do list. The database side (0059) is in supabase/tests/smoke-test.mjs.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const rights = await import('../src/data/data-rights.ts');
const page = await import('../src/lib/my-data-page.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
const en = new Map(flat(locale('en')));
/** A t() that answers the key with its options, so the sections can be read without i18next. */
const t = (key, options) => (options ? `${key}${JSON.stringify(options)}` : key);
const fmt = { date: (d) => `D(${d})`, dateTime: (ts) => `T(${ts})` };
const migration = repo('supabase/migrations/0059_data_rights.sql');

const summary = {
  generated_at: '2026-10-23T06:00:00Z',
  login: { id: 'u1', role: 'student', full_name: 'Dara', email: 'dara@example.com', phone: null, language: 'te', created_at: '2026-10-01T00:00:00Z' },
  about: { dob: '1992-03-04', diksha_name: null, emergency_relation: 'mother', emergency_name: 'Asha', emergency_phone: '+919000000000', service_areas: ['kirtan'], learn_interests: [] },
  record: { id: 's1', roll_no: 'MS-2026-0059', full_name: 'Dara <b>Fiftynine</b>', dob: '1992-03-04', phone: null, email: null, area: 'Abids', pincode: '500001', status: 'active', joined_on: '2026-10-02', level_id: 1 },
  minor: false,
  level_name: 'Beginner',
  centre_name: 'Abids',
  mentor_name: null,
  requests: [{ ref: 'DR-0001', kind: 'correction', status: 'open', created_at: '2026-10-20T00:00:00Z', closed_at: null }],
  devices: 1,
  notices: 3,
  replies: 0,
  event_answers: 0,
  poll_votes: 0,
  ishtagoshti: null,
  guardians: [],
  consents: [{ scope: 'photo', method: 'written', given_at: '2026-10-02T10:00:00Z', revoked_at: null, id_type_checked: null, notice_version: '0.2-draft' }],
  level_history: [],
  status_history: [],
  visits: { count: 4, first: '2026-10-03T12:00:00Z', last: '2026-10-21T12:00:00Z', list: [] },
  practice: { count: 2, minutes: 30, list: [] },
  syllabus_ticks: 5,
  follow_up_calls: { count: 0, last: null },
  assessments: 0,
  events: 0,
  loans: [],
};

test('#551: a request is answered within 30 days, here, in 0059 and on the website', () => {
  assert.equal(rights.ANSWER_DAYS, 30);
  assert.match(migration, /answer_by\s+timestamptz not null default now\(\) \+ interval '30 days'/);
  assert.match(repo('website/content/en/privacy.html'), /We reply within 30 days/);
});

test('the privacy contact in the app is the notice\'s (email from site.config, phone from the notice)', () => {
  assert.match(repo('website/site.config.mjs'), new RegExp(`privacy: '${rights.PRIVACY_CONTACT.email}'`));
  const notice = repo('website/content/en/privacy.html');
  assert.ok(notice.includes(rights.PRIVACY_CONTACT.name) && notice.includes(rights.PRIVACY_CONTACT.phone));
});

test('references, days left and the action of each kind', () => {
  assert.equal(rights.requestRef(7), 'DR-0007');
  assert.equal(rights.requestRef(12345), 'DR-12345');
  const now = new Date('2026-10-23T10:00:00Z');
  assert.equal(rights.daysLeft('2026-10-25T09:00:00Z', now), 2);
  assert.equal(rights.daysLeft('2026-10-22T09:00:00Z', now), -1);
  assert.deepEqual(rights.FILE_KINDS.map(rights.actionFor), [null, 'withdraw_photo', 'withdraw_consent', 'erase', null, null]);
  assert.equal(rights.actionFor('access'), null);
  // The app files exactly the kinds the database lets a person file (access only comes from the desk).
  const fileList = /p_kind not in \(([^)]+)\) then\s+raise exception 'kind_invalid'/.exec(migration)[1];
  assert.deepEqual([...fileList.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort(), [...rights.FILE_KINDS].sort());
});

test('the form: a correction names the field and says what; a complaint and a nominee need words; limits as in SQL', () => {
  const ok = (form) => rights.checkRequestForm({ kind: null, field: '', body: '', ...form });
  assert.deepEqual(ok({}), { kind: 'dataRights.errors.kind_invalid' });
  assert.deepEqual(ok({ kind: 'correction' }), { field: 'dataRights.errors.field_required', body: 'dataRights.errors.text_required' });
  assert.deepEqual(ok({ kind: 'grievance', body: '  ' }), { body: 'dataRights.errors.text_required' });
  assert.deepEqual(ok({ kind: 'nominate', body: 'My brother' }), {});
  assert.deepEqual(ok({ kind: 'erasure' }), {});
  assert.deepEqual(ok({ kind: 'withdraw_data', body: 'x'.repeat(2001) }), { body: 'dataRights.errors.text_too_long' });
  assert.equal(rights.REQUEST_TEXT_MAX, 2000);
  assert.equal(rights.REQUEST_FIELD_MAX, 80);
  assert.equal(rights.ACTION_NOTE_MAX, 500);
  assert.match(migration, /body\s+text check \(char_length\(body\) between 1 and 2000\)/);
  assert.match(migration, /field\s+text check \(char_length\(field\) between 1 and 80\)/);
  assert.match(migration, /char_length\(v_note\) > 500/);
});

test('every refusal of 0059 has words in the app, in every language', () => {
  const codes = new Set([...migration.matchAll(/raise exception '(\w+)'/g)].map((m) => m[1]));
  const missing = [];
  for (const code of codes) {
    const key = rights.requestErrorKey(code, undefined);
    if (!en.has(key)) missing.push(`${code} -> ${key}`);
  }
  assert.deepEqual(missing, []);
  for (const lang of ['te', 'hi']) {
    const keys = new Map(flat(locale(lang)));
    assert.deepEqual([...en.keys()].filter((k) => k.startsWith('dataRights.') || k.startsWith('dataRequests.')).filter((k) => !keys.has(k)), []);
  }
  // Before 0059 has run the screens say so instead of "no internet".
  assert.equal(rights.requestErrorKey('x', 'PGRST202'), 'dataRights.notSetUp');
});

test('#550: the summary shows the record, consents with dates, activity and every processor of the notice', () => {
  const sections = page.summarySections(t, summary, fmt);
  assert.deepEqual(sections.map((s) => s.key), ['login', 'record', 'about', 'consents', 'activity', 'processors', 'requests']);
  const consent = sections.find((s) => s.key === 'consents').rows[0];
  assert.equal(consent.label, 'dataRights.consentScope.photo');
  assert.match(consent.value, /D\(2026-10-02\)/);
  assert.match(consent.value, /0\.2-draft/);
  const record = sections.find((s) => s.key === 'record').rows;
  assert.ok(record.some((r) => r.value === 'MS-2026-0059'));
  assert.ok(!JSON.stringify(sections).includes('qr_token'));
  // Each processor in the app is in the privacy notice's table, and the other way round.
  const notice = repo('website/content/en/privacy.html');
  const table = notice.slice(notice.indexOf('<caption>Data processors</caption>'), notice.indexOf('</table>', notice.indexOf('<caption>Data processors')));
  const noticeNames = [...table.matchAll(/<tr><td>([^<]+)<\/td>/g)].map((m) => m[1]);
  const appNames = page.PROCESSORS.map((p) => en.get(`dataRights.processors.${p}.name`));
  assert.deepEqual([...appNames].sort(), [...noticeNames].sort());
  // A person without a record (staff) gets no record, consents or activity on it, and no crash.
  const staff = page.summarySections(t, { ...summary, record: null, about: null, consents: undefined, visits: undefined, practice: undefined,
    syllabus_ticks: undefined, follow_up_calls: undefined, assessments: undefined, events: undefined, loans: undefined, level_history: undefined, requests: [] }, fmt);
  assert.deepEqual(staff.map((s) => s.key), ['login', 'activity', 'processors']);
});

test('#550: the printable page escapes every value and holds no script; the JSON is the summary itself', () => {
  const html = page.myDataPageHtml('My data', ['As on now'], page.summarySections(t, summary, fmt), ['Contact <x>']);
  assert.ok(html.includes('Dara &lt;b&gt;Fiftynine&lt;/b&gt;'));
  assert.ok(!html.includes('<b>Fiftynine'));
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes('Contact &lt;x&gt;'));
  assert.match(page.PRINT_CSS, /body>\*:not\(#ms-data-print\)\{display:none!important\}/);
  assert.deepEqual(JSON.parse(rights.summaryJson(summary)), summary);
  assert.equal(rights.summaryFileName(summary, 'json'), 'mridanga-seva-my-data-2026-10-23.json');
});

test('#550: the download uses what the APK already has (no new native package)', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const native = src('lib/data-export.ts');
  for (const m of native.matchAll(/from '([^'.@][^']*)'/g)) assert.ok(pkg.dependencies[m[1]], `${m[1]} is not in package.json`);
  assert.match(native, /CAN_PRINT = false/);
  assert.match(src('lib/data-export.web.ts'), /CAN_PRINT = true/);
});

test('My profile opens My data and rights; the To do lists the Guru\'s data requests first and counts them', () => {
  assert.match(src('screens/my-profile.tsx'), /router\.push\(isStudent \? '\/student\/my-data' : '\/staff\/my-data'\)/);
  const today = src('components/staff-today.tsx');
  assert.match(today, /\+ board\.dataRequests;/);
  assert.ok(today.indexOf("key: 'dataRequests'") < today.indexOf("key: 'signups'"));
  assert.match(src('data/home.ts'), /guru \? countOpenRequests\(\) : Promise\.resolve\(0\)/);
  // A child is told the parent asks; the Guru answers instead of filing.
  const screen = src('screens/my-data-rights.tsx');
  assert.match(screen, /summary\.minor \?/);
  assert.match(screen, /isGuru \?/);
});
