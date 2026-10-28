// Unit tests for the facilitator's P0 safeguards (Sarvesh's Facilitator Module review 27-10-2026 §8, migration 0066,
// docs/DECISIONS.md #710-#719): a refused fund decision read as an error (FUND-01), the erasure approval's identity
// checks and wiring (PRIV-01), the import's error file, all-or-none results and dry run wiring (STU-01/02), the error
// log's name rule matching the database's (AUD-02), and the te/hi strings. The database side is in
// supabase/tests/smoke-test.mjs ("0066"). Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const fund = await import('../src/data/fund.ts');
const rights = await import('../src/data/data-rights.ts');
const imp = await import('../src/data/student-import.ts');
const rules = await import('../src/lib/error-report-rules.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const repo = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);
const migration = repo('supabase/migrations/0066_facilitator_p0.sql');

test('FUND-01 #710: a refused decision is an error on screen; a made one is not', () => {
  assert.deepEqual(fund.decisionRefusal({ refused: 'own_entry' }), { errorKey: 'fund.errors.own_entry' });
  assert.deepEqual(fund.decisionRefusal({ refused: 'not_approver' }), { errorKey: 'fund.errors.not_allowed' });
  assert.deepEqual(fund.decisionRefusal({ status: 'approved' }), {});
  assert.deepEqual(fund.decisionRefusal(null), {}, 'before 0066 the database answered nothing');
  assert.match(src('data/fund.ts'), /return decisionRefusal\(data\);/);
});

test('PRIV-01 #712: "own login" fits only a request the person filed in the app themselves', () => {
  const person = { name: 'X', rollNo: 'MS-1', email: null, dob: null, studentId: 's1', profileId: 'p1' };
  assert.deepEqual(rights.identityChecksFor({ source: 'app', person }, 'p1'), ['own_login', 'id_seen', 'registered_email', 'phone_callback']);
  assert.deepEqual(rights.identityChecksFor({ source: 'desk', person }, 'g1'), ['id_seen', 'registered_email', 'phone_callback']);
  assert.deepEqual(rights.identityChecksFor({ source: 'app', person }, 'someone-else'), ['id_seen', 'registered_email', 'phone_callback']);
  assert.deepEqual([...rights.IDENTITY_CHECKS], ['own_login', 'id_seen', 'registered_email', 'phone_callback']);
  for (const c of rights.IDENTITY_CHECKS) assert.ok(migration.includes(`'${c}'`), `${c} is a code the database knows`);
});

test('PRIV-01 #712: every refusal of the two-person rule has its words', () => {
  for (const code of ['second_approval_needed', 'approver_cannot_erase', 'not_erasure', 'already_approved', 'identity_invalid', 'not_the_recorder']) {
    assert.equal(rights.requestErrorKey(code, 'P0001'), `dataRights.errors.${code}`);
    assert.ok(migration.includes(`'${code}'`), `${code} is raised by 0066`);
  }
});

test('PRIV-01 #712: the request screen shows the approval step and carries out only when another Guru approved', () => {
  const screen = src('app/staff/data-requests/[id].tsx');
  assert.match(screen, /const canCarryOut = !twoPeople \|\| \(approved !== null && approved\.by !== profile\?\.id\);/);
  assert.match(screen, /r\.status === 'open' && action && canCarryOut \?/);
  assert.match(screen, /approveErasure\(r\.id, check\)/);
  assert.match(screen, /state\.madeBy === profile\?\.id \? <Notice tone="info">\{t\('dataRequests\.approval\.youRecorded'\)\}/);
});

test('STU-01: the error file keeps the file\'s own columns and adds the problem, rows in file order', () => {
  const rows = [
    ['Name', 'DOB', 'Phone'],
    ['Asha', '01-01-1990', '9000000001'],
    ['Kid', '01-01-2018'],
    ['Ravi', 'not a date', '9000000002', 'extra'],
  ];
  const lines = new Map([
    [4, ['Date of birth is not a date']],
    [3, ['Under 18: use the form', 'Phone missing']],
  ]);
  assert.deepEqual(imp.problemCsvRows(rows, lines, 'Problem'), [
    ['Name', 'DOB', 'Phone', '', 'Problem'],
    ['Kid', '01-01-2018', '', '', 'Under 18: use the form; Phone missing'],
    ['Ravi', 'not a date', '9000000002', 'extra', 'Date of birth is not a date'],
  ]);
  assert.equal(imp.problemFileName('students 2026.xlsx'), 'students 2026-problems.csv');
  assert.equal(imp.problemFileName('list.csv'), 'list-problems.csv');
});

test('STU-02 #714: all-or-none answers read as saved, refused or held', () => {
  assert.deepEqual(imp.toImportResult({ line: 2, held: true }), { line: 2, rollNo: undefined, problem: undefined, held: true });
  assert.deepEqual(imp.toImportResult({ line: 3, error: 'minor_use_form' }), { line: 3, rollNo: undefined, problem: 'minor_use_form', held: undefined });
  assert.equal(imp.toImportResult({ line: 4, error: 'something_new' }).problem, 'row_failed');
  assert.equal(imp.toImportResult({ line: 5, roll_no: 'MS-2026-0101' }).rollNo, 'MS-2026-0101');
  assert.equal(imp.WHOLE_MAX, 500);
  const data = src('data/student-import.ts');
  assert.match(data, /supabase\.rpc\('import_all_or_none', \{ p_rows: rowsForDatabase\(rows, importId\), p_dry_run: false \}\)/);
  assert.match(data, /p_dry_run: true,/);
  const screen = src('app/staff/database/import.tsx');
  assert.match(screen, /const wholeAllowed = bad\.length === 0 && good\.length <= WHOLE_MAX;/);
  assert.match(screen, /whole \? await importAllOrNone\(good, importId\(\)\) : await importRows\(good, importId\(\)\)/);
  assert.match(screen, /checkWithDatabase\(good\)/);
});

test('AUD-02 #716: an error name that is not an error class never leaves the phone; the database keeps the same rule', () => {
  const named = (name) => Object.assign(new Error('x'), { name });
  assert.equal(rules.errorName(new TypeError('phone 9876543210')), 'TypeError');
  assert.equal(rules.errorName({ name: 'AuthApiError' }), 'AuthApiError');
  assert.equal(rules.errorName(named('Priyanka')), 'Error', 'a person\'s name');
  assert.equal(rules.errorName(named('Error9876543210')), 'Error', 'a phone number');
  assert.equal(rules.errorName(named('eyJhbGciOiJIUzI1NiJ9')), 'Error', 'a token');
  assert.equal(rules.errorName(named('priya_example_com')), 'Error', 'an email-like word');
  assert.equal(rules.errorName(named('RecordingTokenabc123Error')), 'Error', 'digits inside');
  assert.equal(rules.errorName('a string'), 'NonError');
  const jsRule = /\/(\^\[A-Z\]\[A-Za-z\]\{0,50\}\(Error\|Exception\)\$)\//.exec(src('lib/error-report-rules.ts'))?.[1];
  assert.ok(jsRule, 'the app has the rule');
  assert.ok(migration.includes(`p_name ~ '${jsRule}'`), 'the database keeps the same rule (client_error_name)');
});

test('the change log can show and filter refused tries', () => {
  assert.match(src('data/audit-log.ts'), /export type AuditAction = 'INSERT' \| 'UPDATE' \| 'DELETE' \| 'REFUSED';/);
  assert.match(src('app/staff/audit-log.tsx'), /\{ value: 'REFUSED', label: t\('auditLog\.actions\.REFUSED'\) \}/);
});

test('te and hi have every new string, with the same placeholders', () => {
  const en = locale('en');
  const keys = [
    'auditLog.actions.REFUSED',
    ...['second_approval_needed', 'approver_cannot_erase', 'not_erasure', 'already_approved', 'identity_invalid', 'not_the_recorder'].map(
      (k) => `dataRights.errors.${k}`,
    ),
    ...['title', 'what', 'checkLabel', 'button', 'done', 'line', 'youRecorded', 'youApproved'].map((k) => `dataRequests.approval.${k}`),
    ...rights.IDENTITY_CHECKS.map((c) => `dataRequests.approval.checks.${c}`),
    ...['dbCheck', 'dbCheckHint', 'dbCheckOk_one', 'dbCheckOk_other', 'dbCheckFound_one', 'dbCheckFound_other', 'dbCheckNotSetUp',
      'problemsCsvTitle', 'problemsCsvHint', 'problemColumn', 'modeLabel', 'modePartial', 'modeAll', 'modeAllNeedsClean',
      'wholeTooMany', 'wholeNotSetUp', 'donePartial', 'doneAllSaved', 'doneAllNone_one', 'doneAllNone_other', 'heldLine'].map(
      (k) => `importStudents.${k}`,
    ),
  ];
  const holes = (text) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
  for (const lang of ['te', 'hi']) {
    const other = locale(lang);
    for (const key of keys) {
      assert.equal(typeof get(en, key), 'string', `en ${key}`);
      assert.equal(typeof get(other, key), 'string', `${lang} ${key}`);
      assert.notEqual(get(other, key), get(en, key), `${lang} ${key} is translated`);
      assert.equal(holes(get(other, key)), holes(get(en, key)), `${lang} ${key} placeholders`);
    }
  }
  assert.ok(!/\bGuru\b/.test(keys.map((k) => get(en, k)).join(' ')), 'new English words say "facilitator", never "Guru"');
});
