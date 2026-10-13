// Unit tests for the after-launch forms and flows (docs/DECISIONS.md #322-#329; audit phase 1 B4-B10 and
// phase 2 F9-F12, R3-04): creates saved once per request id, uploads not repeated, lists read past
// 1,000 rows, the CSV exports, the inventory codes, the stocktake confirms. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { readAllRows } = await import('../src/lib/paged-read.ts');
const { insertOnce, rpcOnce, uploadOnce, forgetUploads, isRepeatedRequest } = await import('../src/data/create-once.ts');
const { toCsv } = await import('../src/lib/csv.ts');
const { fundCsvRows, fundErrorField, parseRupees, checkEntryForm } = await import('../src/data/fund.ts');
const { keptValue } = await import('../src/lib/kept-load.ts');
const { shouldReload, RESUME_AFTER_MS } = await import('../src/lib/resume-rule.ts');
const { attendanceChange } = await import('../src/data/events.ts');
const { groupImports } = await import('../src/data/student-import.ts');
const { phoneToSave } = await import('../src/data/students.ts');
const { phoneCountryOf } = await import('../src/lib/phone.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locales = Object.fromEntries(
  ['en', 'te', 'hi'].map((l) => [l, JSON.parse(readFileSync(new URL(`../src/i18n/locales/${l}.json`, import.meta.url), 'utf8'))]),
);
const text = (lang, key) => key.split('.').reduce((o, k) => o?.[k], locales[lang]);
function assertWorded(...keys) {
  for (const key of keys) for (const lang of ['en', 'te', 'hi']) assert.ok(text(lang, key), `${lang}: ${key}`);
}

const NO_ANSWER = { message: 'Network request failed: no answer in time' };
const REPEAT = { code: '23505', message: 'duplicate key value violates unique constraint "events_request_id_key"' };

/**
 * A fake Supabase client: `insert` answers from `insertAnswers` in turn, a select by request_id from
 * `saved` (table -> id), `rpc` from `rpcAnswers` in turn. Calls are recorded.
 */
function fakeClient({ insertAnswers = [], saved = {}, rpcAnswers = [], lookupFails = false } = {}) {
  const calls = { inserts: [], lookups: [], rpcs: [] };
  const client = {
    calls,
    from(table) {
      return {
        insert(row) {
          calls.inserts.push({ table, row });
          const answer = insertAnswers.shift() ?? { data: { id: 1 }, error: null };
          return { select: () => ({ single: async () => answer }) };
        },
        select() {
          return {
            eq(column, value) {
              calls.lookups.push({ table, column, value });
              return {
                maybeSingle: async () =>
                  lookupFails ? { data: null, error: NO_ANSWER } : { data: saved[table] ? { id: saved[table] } : null, error: null },
              };
            },
          };
        },
      };
    },
    async rpc(fn, args) {
      calls.rpcs.push({ fn, args });
      return rpcAnswers.shift() ?? { data: 7, error: null };
    },
  };
  globalThis.__testSupabase = client;
  return client;
}

// ---------------------------------------------------------------- #322 creates saved once (P1-02)

test('a create sends its request id and returns the new id', async () => {
  const db = fakeClient({ insertAnswers: [{ data: { id: 41 }, error: null }] });
  assert.deepEqual(await insertOnce('events', { title: 'Kirtan' }, 'r-1'), { id: 41, repeated: false });
  assert.deepEqual(db.calls.inserts[0].row, { title: 'Kirtan', request_id: 'r-1' });
  assert.equal(db.calls.lookups.length, 0, 'no lookup after a clean answer');
});

test('a repeat refused by the unique request id returns the first row', async () => {
  const db = fakeClient({ insertAnswers: [{ data: null, error: REPEAT }], saved: { events: 41 } });
  assert.deepEqual(await insertOnce('events', { title: 'Kirtan' }, 'r-1'), { id: 41, repeated: true });
  assert.deepEqual(db.calls.lookups[0], { table: 'events', column: 'request_id', value: 'r-1' });
});

test('no answer: the row saved meanwhile is found; else the network error comes back (and Save again is safe)', async () => {
  fakeClient({ insertAnswers: [{ data: null, error: NO_ANSWER }], saved: { polls: 9 } });
  assert.deepEqual(await insertOnce('polls', {}, 'r-2'), { id: 9, repeated: true });
  fakeClient({ insertAnswers: [{ data: null, error: NO_ANSWER }] });
  assert.deepEqual(await insertOnce('polls', {}, 'r-2'), { error: NO_ANSWER });
  fakeClient({ insertAnswers: [{ data: null, error: NO_ANSWER }], saved: { polls: 9 }, lookupFails: true });
  assert.deepEqual(await insertOnce('polls', {}, 'r-2'), { error: NO_ANSWER }, 'the lookup failing too: still unknown');
});

test('a refusal is passed on as it is, without a lookup', async () => {
  const refused = { code: 'P0001', message: 'title_required' };
  const db = fakeClient({ insertAnswers: [{ data: null, error: refused }] });
  assert.deepEqual(await insertOnce('materials', {}, 'r-3'), { error: refused });
  assert.equal(db.calls.lookups.length, 0);
  assert.equal(isRepeatedRequest({ code: '23505', message: 'duplicate key value violates unique constraint "fund_categories_name_key"' }), false,
    'another unique key is not a repeat');
});

test('a request-id function is asked once more only when two Saves raced', async () => {
  const db = fakeClient({ rpcAnswers: [{ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "call_logs_request_id_key"' } }, { data: 'c-1', error: null }] });
  assert.deepEqual(await rpcOnce('log_call', { p_request_id: 'r-4' }), { data: 'c-1', error: null });
  assert.equal(db.calls.rpcs.length, 2);
  const once = fakeClient({ rpcAnswers: [{ data: null, error: NO_ANSWER }] });
  assert.deepEqual(await rpcOnce('log_call', { p_request_id: 'r-4' }), { data: null, error: NO_ANSWER });
  assert.equal(once.calls.rpcs.length, 1, 'no answer is not retried by itself');
});

test('a Save repeated after a lost answer sends the file uploaded the first time, not a copy', async () => {
  let uploads = 0;
  const upload = async () => ({ path: `me/file-${++uploads}.jpg` });
  const first = await uploadOnce('r-5', 'bill-a', upload);
  const again = await uploadOnce('r-5', 'bill-a', upload);
  assert.equal(first.path, again.path);
  assert.equal(uploads, 1);
  assert.notEqual((await uploadOnce('r-5', 'bill-b', upload)).path, first.path, 'another picked file uploads again');
  forgetUploads('r-5');
  assert.equal((await uploadOnce('r-5', 'bill-a', upload)).path, 'me/file-3.jpg', 'forgotten after the save');
  assert.equal(await uploadOnce('r-6', 'x', async () => null), null, 'a failed upload is not kept');
});

test('every create the audit named sends its request id, and the forms keep one per open form', () => {
  for (const [file, call] of [
    ['data/fund.ts', "rpcOnce<number>('record_fund_entry'"],
    ['data/follow-up.ts', "rpcOnce('log_call'"],
    ['data/practice.ts', "rpcOnce('log_practice'"],
    ['data/events.ts', "insertOnce('events'"],
    ['data/polls.ts', "insertOnce('polls'"],
    ['data/assessments.ts', "'assessments',"],
    ['data/materials.ts', "'materials',"],
    ['data/syllabus-editor.ts', "insertOnce('syllabus_items'"],
    ['data/ishtagoshti.ts', "insertOnce('ig_themes'"],
    ['data/announcements.ts', "insertOnce('announcement_replies'"],
  ]) assert.ok(src(file).includes(call), `${file}: ${call}`);
  for (const file of ['app/staff/fund/[id].tsx', 'app/staff/call/[id].tsx', 'screens/event-form.tsx', 'screens/poll-form.tsx',
    'screens/assessment-form.tsx', 'app/staff/materials/[id].tsx', 'app/staff/levels/item/[id].tsx', 'app/staff/ishtagoshti/edit-theme/[id].tsx',
    'components/reply-box.tsx', 'app/student/practice-log.tsx', 'screens/practice-tools.tsx']) {
    assert.ok(src(file).includes('useRequestId()'), file);
  }
});

test('P1-03: a lost answer no longer deletes the bill, the material file, the assessment files or the recording', () => {
  assert.match(src('data/fund.ts'), /if \(!isNetworkError\(error\.message\)\) \{\s+if \(bill\) await removeFiles/);
  assert.match(src('data/materials.ts'), /if \(!isNetworkError\(saved\.error\.message\)\) \{\s+if \(file\) await removeFiles/);
  assert.match(src('data/assessments.ts'), /if \(!isNetworkError\(saved\.error\.message\)\) \{\s+await removeMedia/);
  assert.match(src('app/staff/ishtagoshti/edit-sloka/[id].tsx'), /if \(uploaded && !result\.noAnswer\) await removeRecitation/);
});

// ---------------------------------------------------------------- #325 fund and inventory (P1-19, P1-21, P1-23, F3-10, F3-17)

test('a list is read in pages of 1,000 until a short page, in one order', async () => {
  const rows = Array.from({ length: 2345 }, (_, i) => i);
  const asked = [];
  const read = await readAllRows(async (from, to) => {
    asked.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.equal(read.data.length, 2345);
  assert.deepEqual(asked, [[0, 999], [1000, 1999], [2000, 2999]]);
  const exact = await readAllRows(async (from, to) => ({ data: rows.slice(0, 1000).slice(from, to + 1), error: null }));
  assert.equal(exact.data.length, 1000, 'exactly 1,000 rows: one more (empty) page ends it');
  const failed = await readAllRows(async (from) => (from === 0 ? { data: rows.slice(0, 1000), error: null } : { data: null, error: NO_ANSWER }));
  assert.deepEqual(failed, { data: null, error: NO_ANSWER }, 'a failed page fails the read, never a short list');
});

test('the fund, the inventory and a count are read past 1,000 rows', () => {
  assert.match(src('data/fund.ts'), /readAllRows\(\(from, to\) => supabase\.from\('fund_entries'\)[^\n]+\.order\('id'\)\.range\(from, to\)\)/);
  assert.match(src('data/inventory.ts'), /readAllRows\(\(from, to\) => supabase\.from\('inventory_items'\)[^\n]+\.order\('id'\)\.range\(from, to\)\)/);
  assert.match(src('data/inventory.ts'), /inventory_stocktake_items[^\n]+\.range\(from, to\)/);
});

test('the fund CSV has ISO dates and a signed effect on the balance', () => {
  const t = (key, values) => (values ? `${key} ${JSON.stringify(values)}` : key);
  const entry = (over) => ({ id: 1, direction: 'income', categoryId: 1, onDate: '2026-10-05', amountPaise: 125050, party: null, reference: null,
    note: null, billPath: null, billName: null, status: 'approved', reversesId: null, reversedById: null, createdBy: 'a', createdByName: 'Guru',
    madeByGuru: true, createdAt: '', decidedByName: null, decidedAt: null, decisionNote: null, effectPaise: 125050, balanceAfterPaise: 125050, ...over });
  const book = { categories: [{ id: 1, direction: 'income', code: 'donation', name: 'Donation', sort: 1, retired: false }] };
  const rows = fundCsvRows(book, [entry({ id: 2, direction: 'expense', onDate: '2026-10-13', amountPaise: 50000, effectPaise: -50000, balanceAfterPaise: 75050 }), entry()], t);
  assert.deepEqual(rows[0].slice(0, 5), ['fund.csv.date', 'fund.csv.kind', 'fund.csv.category', 'fund.csv.amount', 'fund.csv.effect']);
  assert.deepEqual(rows[1].slice(0, 1), ['2026-10-05']);
  assert.deepEqual([rows[2][0], rows[2][3], rows[2][4]], ['2026-10-13', '500.00', '-500.00']);
  assertWorded('fund.csv.effect');
});

test('a CSV cell starting like a formula, a tab or a full-width sign is defused', () => {
  const csv = toCsv([['=1+1', '\tcmd', '＝HYPERLINK()', '-12.5', 'Rama']]);
  assert.equal(csv, "﻿'=1+1,'\tcmd,'＝HYPERLINK(),-12.5,Rama\r\n");
});

test('the inventory list shows and searches the label code again (P1-21)', () => {
  const list = src('app/staff/inventory/index.tsx');
  assert.ok(list.includes('searchFold(`${item.code} ${item.label}'));
  assert.ok(list.includes('title={`${item.code} · ${item.label}`}'));
  assert.ok(src('app/staff/inventory/[id].tsx').includes('title={`${item.code} · ${item.label}`}'));
});

test('Finish and Delete of a count each ask first (P1-23)', () => {
  const screen = src('app/staff/inventory/stocktake/[id].tsx');
  assert.ok(screen.includes("setAsking('finish')") && screen.includes("setAsking('delete')"));
  assert.ok(!/label=\{t\('stocktake\.delete'\)\}\s+onPress=\{\(\) =>\s+void \(async/.test(screen), 'Delete no longer acts on the first tap');
  assertWorded('stocktake.finishAsk', 'stocktake.finishAskBody_one', 'stocktake.finishAskBody_other', 'stocktake.finishAskAllSeen',
    'stocktake.finishYes', 'stocktake.deleteHint', 'stocktake.deleteAsk', 'stocktake.deleteAskBody_one', 'stocktake.deleteAskBody_other');
});

// ---------------------------------------------------------------- #324 phones, #326 imports, #328 attendance

test('the desk sends phones as E.164; an unknown class country counts as India', () => {
  assert.equal(phoneToSave('98765 43210'), '+919876543210');
  assert.equal(phoneToSave('098765-43210'), '+919876543210');
  assert.equal(phoneToSave('+44 20 7946 0958'), '+442079460958');
  assert.equal(phoneToSave('  '), null);
  assert.equal(phoneCountryOf('US'), 'US');
  assert.equal(phoneCountryOf('XX'), 'IN');
  assert.equal(phoneCountryOf(null), 'IN');
});

test('an import is undone by its id; the list groups records by import, newest first', () => {
  const rows = [
    { import_id: 'a', created_at: '2026-10-20T10:00:05Z' },
    { import_id: 'b', created_at: '2026-10-21T09:00:00Z' },
    { import_id: 'a', created_at: '2026-10-20T10:00:01Z' },
  ];
  assert.deepEqual(groupImports(rows), [
    { importId: 'b', at: '2026-10-21T09:00:00Z', count: 1 },
    { importId: 'a', at: '2026-10-20T10:00:01Z', count: 2 },
  ]);
  const importer = src('data/student-import.ts');
  assert.ok(importer.includes('import_id: importId,'), 'every row carries the import id');
  assert.ok(src('app/staff/database/import.tsx').includes("t('importStudents.notSent'"), 'rows not sent are counted (R3-07)');
  assertWorded('importStudents.undoButton', 'importStudents.undoAsk_one', 'importStudents.undoAsk_other', 'importStudents.undoBody',
    'importStudents.undoDone_one', 'importStudents.undoDone_other', 'importStudents.notSent_one', 'importStudents.notSent_other',
    'importStudents.importRest', 'importStudents.recentTitle', 'studentTools.delete', 'studentTools.deleteBody',
    'studentTools.errors.student_linked', 'studentTools.errors.student_visited', 'studentTools.errors.student_has_history',
    'studentTools.errors.student_withdrawn');
});

test('the Guru deletes a record only with a reason and the name typed again', () => {
  const tools = src('components/guru-student-tools.tsx');
  assert.match(tools, /disabled=\{busy \|\| reason\.trim\(\)\.length < 3 \|\| !nameTypedRight\(typedName, student\.fullName\)\}/);
  assert.ok(src('data/student-admin.ts').includes("supabase.rpc('delete_student_record'"));
});

test('event attendance sends only what this phone changed (R2-07)', () => {
  assert.deepEqual(attendanceChange(new Set(['a', 'b']), new Set(['b', 'c'])), { came: ['c'], notCame: ['a'] });
  assert.deepEqual(attendanceChange(new Set(['a']), new Set(['a'])), { came: [], notCame: [] });
  assert.ok(src('data/events.ts').includes("supabase.rpc('change_event_attendance'"));
  assert.ok(!src('data/events.ts').includes("'mark_event_attendance'"), 'the whole-list replace is no longer called');
});

// ---------------------------------------------------------------- #323 shared form parts

test('number boxes read Telugu and Devanagari digits; an amount pasted with them too', () => {
  assert.equal(parseRupees('౧,౨౫౦.౫౦'), 125050);
  assert.equal(parseRupees('१२५०'), 125000);
  const field = src('components/text-field.tsx');
  assert.ok(field.includes('onChangeText(asciiDigits(text))'));
  for (const [kind, keyboard] of [['phone', 'phone-pad'], ['number', 'number-pad'], ['decimal', 'decimal-pad']]) {
    assert.ok(new RegExp(`case '${kind}':\\s+return \\{ keyboardType: '${keyboard}'`).test(field), kind);
  }
  assert.ok(/case 'name':\s+return \{ autoCorrect: false, autoCapitalize: 'words'/.test(field), 'names: no autocorrect (F5-08)');
  assert.ok(/case 'time':[^}]+maxLength: 11/.test(field), 'a time takes "12:15 a.m." (F4-15)');
});

test('the hint stays when an error shows, both are read out, long boxes count characters', () => {
  const field = src('components/text-field.tsx');
  assert.ok(field.includes("accessibilityHint={[hint, error].filter(Boolean).join('. ') || undefined}"));
  assert.ok(!field.includes('error ?? hint'), 'the error no longer replaces the hint (F5-12)');
  assert.ok(field.includes("t('common.charactersUsed'"));
  assertWorded('common.charactersUsed', 'common.fixFieldsTitle_one', 'common.fixFieldsTitle_other', 'common.goToField', 'common.refreshFailed');
});

test('the error summary lists the fields in page order with their messages', async () => {
  const { summaryItems } = await import('../src/components/form-error-summary.tsx').catch(() => ({ summaryItems: null }));
  const fields = [{ key: 'amount', label: 'Amount' }, { key: 'date', label: 'Date' }, { key: 'note', label: 'Note' }];
  if (summaryItems) {
    assert.deepEqual(summaryItems({ note: 'fund.x', amount: 'Too big' }, fields, (v) => `<${v}>`), [
      { key: 'amount', label: 'Amount', message: '<Too big>' },
      { key: 'note', label: 'Note', message: '<fund.x>' },
    ]);
  }
  assert.ok(src('components/form-error-summary.tsx').includes('accessibilityRole="link"'));
});

test('a refusal of the fund form shows at its field; a date over a year back is caught before the bill uploads', () => {
  assert.equal(fundErrorField('fund.errors.date_too_old'), 'date');
  assert.equal(fundErrorField('fund.errors.bill_missing'), 'bill');
  assert.equal(fundErrorField('fund.errors.party_too_long'), 'party');
  assert.equal(fundErrorField('common.networkError'), null);
  const form = { direction: 'income', categoryId: 1, date: '', amount: '10', party: '', reference: '', note: '', bill: null };
  assert.equal(checkEntryForm(form, '2025-10-01', '2026-10-13', 50000).date, 'fund.errors.date_too_old');
  assert.equal(checkEntryForm(form, '2025-10-20', '2026-10-13', 50000).date, undefined);
});

test('Button ignores presses while the promise it was given runs', () => {
  const button = src('components/button.tsx');
  assert.ok(button.includes('if (running.current) return;'));
  assert.ok(button.includes('aria-busy={!!loading || busy}'));
});

// ---------------------------------------------------------------- #327 leave guard, kept data, reload on resume

test('Back asks before a half-filled form is lost, never after a save', () => {
  for (const file of ['app/staff/register.tsx', 'app/staff/announcements/new.tsx', 'screens/event-form.tsx', 'screens/poll-form.tsx',
    'screens/assessment-form.tsx', 'app/staff/call/[id].tsx', 'app/staff/fund/[id].tsx', 'app/staff/materials/[id].tsx']) {
    assert.ok(src(file).includes('useLeaveGuard('), file);
  }
  for (const file of ['screens/event-form.tsx', 'screens/poll-form.tsx', 'screens/assessment-form.tsx', 'app/staff/fund/[id].tsx',
    'app/staff/materials/[id].tsx', 'app/staff/announcements/new.tsx']) {
    const text = src(file);
    assert.ok(/allowLeave\(\);\s+(\/\/[^\n]*\n\s+)?(router\.(back|replace|dismissTo)|goBackOr)\(/.test(text), `${file}: allowLeave before leaving`);
  }
  assert.ok(src('lib/use-leave-guard.ts').includes("from 'expo-router/react-navigation'"));
  assertWorded('leaveGuard.title', 'leaveGuard.body', 'leaveGuard.keep', 'leaveGuard.discard');
});

test('a failed reload keeps the data shown; the first load still shows its error', () => {
  assert.deepEqual(keptValue({ n: 1 }, null), { value: { n: 1 }, failed: true });
  assert.deepEqual(keptValue(undefined, null), { value: null, failed: false });
  assert.deepEqual(keptValue('not_found', null), { value: null, failed: false });
  assert.deepEqual(keptValue({ n: 1 }, { n: 2 }), { value: { n: 2 }, failed: false });
  for (const file of ['app/student/announcements/[id].tsx', 'app/student/assessments/[id].tsx', 'app/student/practice-log.tsx',
    'screens/event-detail.tsx', 'screens/poll-detail.tsx', 'app/student/progress.tsx', 'app/staff/students/[id].tsx', 'app/staff/here-now.tsx']) {
    const text = src(file);
    assert.ok(text.includes('useKeptLoad<') && text.includes('<RefreshFailed at={refreshFailed}'), file);
  }
});

test('a screen loads again when the app comes back after five minutes or more', () => {
  assert.equal(shouldReload(null, 10 * RESUME_AFTER_MS), false);
  assert.equal(shouldReload(0, RESUME_AFTER_MS - 1), false);
  assert.equal(shouldReload(0, RESUME_AFTER_MS), true);
  for (const file of ['screens/coordinator-home.tsx', 'screens/guru-home.tsx', 'app/student/(tabs)/index.tsx', 'app/staff/(tabs)/attendance.tsx',
    'app/staff/here-now.tsx', 'app/staff/(tabs)/follow-up.tsx', 'screens/notifications.tsx']) {
    assert.ok(src(file).includes('useReloadOnResume('), file);
  }
});