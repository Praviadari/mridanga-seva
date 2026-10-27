// Unit tests for the after-launch speed, accessibility and language round (docs/DECISIONS.md #330-#335, audit
// phase 4 B4-5..B4-9): paged reads, the minute-long class copy, the delayed second tap, the weekly push check,
// worded server refusals, Telugu and Hindi loaded when chosen, and the review sheet. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unzipSync } from 'fflate';

import './stubs/register.mjs';

const srcUrl = new URL('../src/', import.meta.url);
const src = (path) => readFileSync(new URL(path, srcUrl), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const text = (dict, key) => key.split('.').reduce((o, k) => o?.[k], dict);

test('B4-5: readAllPages reads 1,000-row pages until a short one, in order', async () => {
  const { readAllPages, PAGE_ROWS } = await import('../src/lib/read-all.ts');
  assert.equal(PAGE_ROWS, 1000);
  const asked = [];
  const rows = Array.from({ length: 2345 }, (_, i) => i);
  const all = await readAllPages((from, to) => {
    asked.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  });
  assert.deepEqual(asked, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(all.length, 2345);
  assert.equal(all[2344], 2344);
  // Exactly 1,000: one more (empty) page to be sure nothing is left.
  const exact = await readAllPages((from, to) => Promise.resolve({ data: rows.slice(0, 1000).slice(from, to + 1), error: null }));
  assert.equal(exact.length, 1000);
  assert.equal(await readAllPages(() => Promise.resolve({ data: null, error: { message: 'x' } })), null);
  let n = 0;
  assert.equal(await readAllPages(() => Promise.resolve(n++ === 0 ? { data: rows.slice(0, 1000), error: null } : { data: null, error: {} })), null, 'a failed later page fails the read');
});

test('B4-5: whole-table reads go through readAllPages, ordered on something unique', () => {
  for (const file of ['data/student-overview.ts', 'data/groups.ts', 'data/qr-cards.ts', 'data/student-database.ts', 'data/fund.ts', 'data/student-import.ts']) {
    const code = src(file);
    // fund.ts and student-import.ts read through the forms branch's lib/paged-read.ts (#325), merged first.
    assert.ok(code.includes('readAllPages') || code.includes('readAllRows'), file);
    assert.ok(/\.order\('id'\)\.range\(from, to\)|\.order\('id'\)\s*\.range\(from, to\)/.test(code.replace(/\n\s+/g, '')), `${file}: ordered on id, then the range`);
  }
  assert.ok(!src('data/student-import.ts').includes('.limit(5000)'), 'the 5000 limit never lifted the 1,000 cap');
});

test('P5-05: a call that may save moves the data version; reads and read-only functions do not', async () => {
  const { noteRequest, dataVersion } = await import('../src/lib/data-version.ts');
  const base = 'https://x.supabase.co';
  const v0 = dataVersion();
  assert.equal(noteRequest(`${base}/rest/v1/student_overview?select=id`, 'GET'), false);
  assert.equal(noteRequest(`${base}/auth/v1/token?grant_type=refresh_token`, 'POST'), false);
  for (const fn of ['get_call_notes', 'search_students', 'is_ig_editor', 'my_about', 'student_home', 'promotion_home', 'inbox_unread_count']) {
    assert.equal(noteRequest(`${base}/rest/v1/rpc/${fn}`, 'POST'), false, fn);
  }
  assert.equal(dataVersion(), v0);
  assert.equal(noteRequest(`${base}/rest/v1/rpc/log_call`, 'POST'), true);
  assert.equal(noteRequest(`${base}/rest/v1/rpc/some_new_function`, 'POST'), true, 'an unknown function counts as a save');
  assert.equal(noteRequest(`${base}/rest/v1/students?id=eq.1`, 'PATCH'), true);
  assert.equal(noteRequest(`${base}/rest/v1/practice_logs`, 'POST'), true);
  assert.equal(dataVersion(), v0 + 4);
});

test('P5-05: keptList answers for a minute, for the same person, until something is saved', async () => {
  const { keptList, noteRequest, dataVersion, KEEP_MS } = await import('../src/lib/data-version.ts');
  const list = keptList();
  list.put('me', ['a'], 1000);
  assert.deepEqual(list.get('me', 1000 + KEEP_MS - 1), ['a']);
  assert.equal(list.get('me', 1000 + KEEP_MS), null, 'older than a minute');
  assert.equal(list.get('someone else', 1001), null, 'another login');
  noteRequest('https://x/rest/v1/rpc/mark_visit', 'POST');
  assert.equal(list.get('me', 1001), null, 'a save drops it');
  const before = dataVersion();
  noteRequest('https://x/rest/v1/rpc/mark_visit', 'POST');
  list.put('me', ['b'], 2000, before);
  assert.equal(list.get('me', 2001), null, 'an answer to a read that a save overtook is never kept as fresh');
  list.put('me', ['c'], 3000);
  list.forget();
  assert.equal(list.get('me', 3001), null);
});

test('P5-05: the Students and Calls tabs share the class copy; pull to refresh always loads', () => {
  const students = src('app/staff/(tabs)/students.tsx');
  const calls = src('app/staff/(tabs)/follow-up.tsx');
  assert.ok(students.includes('fetchStudentSummaries({ keepFor: myId ?? undefined, fresh })'));
  assert.ok(calls.includes('fetchFollowUpQueue({ keepFor: myId ?? undefined, fresh })'));
  for (const screen of [students, calls]) assert.ok(screen.includes('onRefresh={reload}') && screen.includes('const reload = useCallback(() => load(true), [load]);'));
  assert.ok(students.includes('useDeferredValue(filters.search)'), 'D9-08: the list follows the search box when the phone has time');
  assert.ok(src('lib/supabase.ts').includes('noteRequest(address,'), 'every call passes the save watch');
});

test('P5-03 / P5-06: lists and homes load only what they show', () => {
  const ig = src('data/ishtagoshti.ts');
  const listColumns = /const SLOKA_LIST_COLUMNS = '([^']+)'/.exec(ig)[1];
  assert.ok(!/purport|word_meanings/.test(listColumns), 'no purports in a list');
  assert.ok(/fetchSlokaPage[\s\S]*select\(SLOKA_COLUMNS\)/.test(ig), 'the full text on the sloka page');
  assert.ok(src('screens/ishtagoshti-home.tsx').includes('fetchIshtagoshtiCounts(profileId)'));
  const home = src('app/student/(tabs)/index.tsx');
  assert.ok(home.includes('fetchMyOpenAssessmentCount()') && home.includes('fetchStudentHome({ weekStarts: false })'));
  // The Updates count is the bell's own (#672), ids and my reads only.
  assert.ok(src('components/updates-bell.tsx').includes('fetchMyUnreadCount(myId)'));
  assert.ok(!src('data/announcements.ts').includes('fetchMyLatestAnnouncements'));
});

test('P4-04: loads keyed on the profile id, not the profile object', () => {
  for (const file of [
    'screens/ishtagoshti-home.tsx',
    'screens/ishtagoshti-themes.tsx',
    'screens/ishtagoshti-theme.tsx',
    'screens/ishtagoshti-slokas.tsx',
    'screens/ishtagoshti-sloka.tsx',
    'app/staff/ishtagoshti/edit-sloka/[id].tsx',
    'app/staff/inventory/labels.tsx',
    'app/staff/inventory/stocktake/index.tsx',
  ]) {
    const code = src(file);
    assert.ok(!/\[profile(, \w+)?\]\)/.test(code), `${file}: no [profile] dependency`);
    assert.ok(code.includes('const profileId = profile?.id;'), file);
  }
});

test('P5-09 / P4-03: event lists 50 at a time; the skeleton fade on the native driver and still for reduced motion', () => {
  const events = src('screens/event-students.tsx');
  assert.ok(events.includes('shown.slice(0, limit)') && events.includes('const ROW_PAGE = 50;'));
  const cards = src('components/loading-cards.tsx');
  assert.ok(cards.includes("const useNativeDriver = Platform.OS !== 'web';"));
  assert.ok(cards.includes('if (still)') && cards.includes('useReducedMotion()'));
});

test('P4-05: a push registration counts for a week, for the same login and token', async () => {
  const { recentRegistration, rememberRegistration, forgetRegistration, REGISTER_AGAIN_MS } = await import('../src/lib/push-registered.ts');
  forgetRegistration();
  assert.equal(recentRegistration('u1', 'tok', 1000), null);
  rememberRegistration('u1', 'tok', 1000);
  assert.equal(recentRegistration('u1', 'tok', 1000 + REGISTER_AGAIN_MS - 1), 'tok');
  assert.equal(recentRegistration('u1', 'tok', 1000 + REGISTER_AGAIN_MS), null, 'a week later: register again');
  assert.equal(recentRegistration('u2', 'tok', 2000), null, 'another login on the phone');
  assert.equal(recentRegistration('u1', 'other', 2000), null, 'the phone keeps another token');
  assert.equal(recentRegistration('u1', null, 2000), null);
  assert.equal(recentRegistration('u1', 'tok', 500), null, 'a clock set back');
  forgetRegistration();
  assert.equal(recentRegistration('u1', 'tok', 2000), null, 'sign-out forgets it');
  const push = src('lib/push.ts');
  assert.ok(push.includes('forgetRegistration();') && push.includes('rememberRegistration(user, token);'));
});

test('P4-06 / D9-11: Telugu and Hindi are loaded when chosen, English stays in', () => {
  const index = src('i18n/index.ts');
  assert.ok(index.includes("import en from './locales/en.json';"));
  assert.ok(!/import \w+ from '\.\/locales\/(te|hi)\.json'/.test(index), 'no static Telugu or Hindi import');
  assert.ok(/require\('\.\/locales\/te\.json'\)/.test(src('i18n/locale-loaders.ts')));
  assert.ok(/await import\('\.\/locales\/te\.json'\)/.test(src('i18n/locale-loaders.web.ts')));
  for (const file of ['i18n/locale-loaders.ts', 'i18n/locale-loaders.web.ts']) {
    assert.ok(src(file).includes('Promise<Translations>'), `${file}: typed as English's shape (key parity in tsc)`);
  }
  assert.ok(src('app/_layout.tsx').includes('{languageReady ? null : ('), 'the splash stays over the app while the web downloads');
});

test('P2-06: a just-shown confirm ignores taps for 600 ms', async () => {
  const { confirmShown, confirmReady, SECOND_TAP_MS } = await import('../src/lib/second-tap.ts');
  assert.equal(SECOND_TAP_MS, 600);
  confirmShown(10_000);
  assert.equal(confirmReady(10_000 + 599), false);
  assert.equal(confirmReady(10_000 + 600), true);
  for (const file of ['app/student/practice-log.tsx', 'app/staff/assessments/[id].tsx', 'app/staff/announcements/[id].tsx', 'components/record-myself.tsx']) {
    const code = src(file);
    assert.ok(code.includes('confirmShown()') && code.includes('confirmReady()'), file);
  }
});

test('P2-02 / P2-05 / P2-07 / P2-12 / F5-13: focus, labels and names for screen readers', () => {
  for (const [file, key] of [
    ['app/staff/register.tsx', 'register.acceptTitle'],
    ['app/staff/here-now.tsx', 'hereNow.confirmTitle'],
    ['app/staff/announcements/[id].tsx', 'announcements.detail.deleteTitle'],
    ['components/qr-card-panel.tsx', 'qrCards.replaceAsk'],
  ]) {
    const line = src(file).split('\n').find((l) => l.includes(key) && l.includes('<Notice'));
    assert.ok(line && line.includes(' focused'), `${file}: ${key} takes the focus`);
  }
  assert.ok(src('components/qr-scanner.tsx').includes('ref={focusOnFirstDraw}'));
  assert.ok(src('components/form-focus.tsx').includes('else moveFocusTo(node);'));
  assert.ok(src('components/qr-code.tsx').includes('<View accessible role="img"'));
  assert.ok(/style=\{styles\.mark\} accessible accessibilityLabel/.test(src('components/beat-grid.tsx')));
  assert.ok(/accessible\s+role="progressbar"/.test(src('components/progress-bar.tsx')));
  assert.ok(src('components/list-row.tsx').includes('spoken={spoken}'));
  for (const area of ['staff', 'student', 'subscriber']) assert.ok(src(`app/${area}/_layout.tsx`).includes('...webBackOptions'), area);
  assert.ok(src('components/text-field.tsx').includes('aria-required={required || undefined}'));
  assert.ok(src('screens/practice-tools.tsx').includes("t('practice.tempoFaster', { by })"));
});

test('B4-8: large text and colour within the palette', () => {
  assert.ok(src('components/select-field.tsx').includes('rowHeightFor(fontScale)'));
  // The launch UI's band (#352) puts the greeting and the name on a centred line of their own that wraps (P3-08).
  assert.ok(src('components/home-header.tsx').includes("flexWrap: 'wrap'"));
  assert.ok(src('components/inbox-bell.tsx').includes('maxFontSizeMultiplier={1.3}'));
  // P3-07: the tab colours are the design tokens since #336 (contrast-checked with #371).
  assert.ok(src('theme/use-theme.ts').includes('tabBarActiveTintColor: colors.tabActive'));
  for (const area of ['staff', 'student', 'subscriber']) assert.ok(src(`app/${area}/(tabs)/_layout.tsx`).includes('...headerTitleOptions'), area);
  assert.ok(src('components/practice-parts.tsx').includes('{large ? track : null}'));
  // No new colours: the design branch owns new tokens.
  assert.ok(!/#[0-9A-Fa-f]{6}/.test(src('components/header-title.tsx') + src('components/web-back-button.tsx')));
});

test('D8-21: database refusals the screens can meet have words of their own', async () => {
  const { fallbackErrorKey } = await import('../src/data/errors.ts');
  assert.equal(fallbackErrorKey('event_frozen'), 'common.serverErrors.frozen');
  assert.equal(fallbackErrorKey('student_field_locked'), 'common.serverErrors.locked');
  assert.equal(fallbackErrorKey('open_loan'), 'common.serverErrors.openLoan');
  assert.equal(fallbackErrorKey('already_withdrawn'), 'common.studentWithdrawn');
  assert.equal(fallbackErrorKey('bad_token'), 'common.genericError', 'input the screens never send keeps the general message');
  assert.equal(fallbackErrorKey('Network request failed'), 'common.networkError');
  const keys = [...src('data/errors.ts').matchAll(/'(common\.serverErrors\.\w+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 30);
  for (const lang of ['en', 'te', 'hi']) {
    const dict = locale(lang);
    for (const key of keys) assert.ok(text(dict, key), `${lang}: ${key}`);
  }
});

test('B4-9: P1-02 names the tab as it is called; new texts exist in all three languages', () => {
  for (const lang of ['te', 'hi']) {
    const raw = src(`i18n/locales/${lang}.json`);
    assert.ok(!raw.includes('My QR'), `${lang}: no English "My QR" left`);
    const dict = locale(lang);
    assert.ok(text(dict, 'attendance.scanIntro').includes(text(dict, 'tabs.myQr')), `${lang}: the sentence names the tab`);
  }
  for (const key of ['common.back', 'common.required', 'practice.tempoFaster', 'practice.tempoSlower']) {
    for (const lang of ['en', 'te', 'hi']) assert.ok(text(locale(lang), key), `${lang}: ${key}`);
  }
  for (const key of ['practice.tempoFaster', 'practice.tempoSlower']) {
    for (const lang of ['te', 'hi']) assert.ok(text(locale(lang), key).includes('{{by}}'), `${lang}: ${key} keeps {{by}}`);
  }
  // P1-01 settled by Praveen on 14-10-2026 (a native speaker): సమ్మతి is consent; అనుమతి stays for permission.
  assert.ok(text(locale('te'), 'register.writtenConsent').includes('సమ్మతి'));
});

test('B4-9: the review sheet builds, with every text and the flagged ones first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-'));
  try {
    const out = join(dir, 'sheet.xlsx');
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/translation-review.mjs', import.meta.url)), '--out', out]);
    assert.ok(statSync(out).size > 100_000);
    const files = unzipSync(readFileSync(out));
    const workbook = new TextDecoder().decode(files['xl/workbook.xml']);
    for (const name of ['Read me', 'Check first', 'Terms', 'All texts']) assert.ok(workbook.includes(`name="${name}"`), name);
    const first = new TextDecoder().decode(files['xl/worksheets/sheet2.xml']);
    assert.ok(!first.includes('P1-01'), 'no consent line says అనుమతి any more (P1-01 settled 14-10-2026)');
    assert.ok(first.includes('attendance.scanIntro') && first.includes('P1-02'));
    const all = new TextDecoder().decode(files['xl/worksheets/sheet4.xml']);
    const flat = (o) => Object.values(o).flatMap((v) => (v && typeof v === 'object' ? flat(v) : [v]));
    assert.equal((all.match(/<row /g) ?? []).length - 1, flat(locale('en')).length, 'one row per English text');
    assert.ok(all.includes('Register a student (desk)'), 'screens named as people call them');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
