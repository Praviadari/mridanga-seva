// Unit tests for the launch-week app fixes (docs/DECISIONS.md #301-#306, audit phase 2 R4-01, R3-01..05,
// R1-02, R5-01, R5-04, R2-08): Back returns to the screen it came from, the Guru's week-1 tools, My QR saved
// on the home, short read time limits, a visible push failure and Print QR cards' ?ids= through sign-in.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

import './stubs/register.mjs';

const srcUrl = new URL('../src/', import.meta.url);
const src = (path) => readFileSync(new URL(path, srcUrl), 'utf8');

/** Every .ts / .tsx file under src/, as [path relative to src, text]. */
function sourceFiles(dir = srcUrl, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) return sourceFiles(new URL(`${name}/`, dir), `${prefix}${name}/`);
    return /\.tsx?$/.test(name) ? [[`${prefix}${name}`, readFileSync(url, 'utf8')]] : [];
  });
}

/** The text of the call that opens at `open` (the index of its '('), brackets matched. */
function callText(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

// ---------------------------------------------------------------- R4-01 Back to where you came from (#301)

const AREAS = ['staff', 'student', 'subscriber'];

/** The address of every tab screen, e.g. '/staff/students'; a home tab is the area's own address. */
function tabAddresses() {
  return AREAS.flatMap((area) =>
    readdirSync(new URL(`app/${area}/(tabs)/`, srcUrl))
      .filter((name) => name.endsWith('.tsx') && name !== '_layout.tsx')
      .map((name) => (name === 'index.tsx' ? `/${area}` : `/${area}/${name.replace(/\.tsx$/, '')}`)),
  );
}

/**
 * Files shown only inside the tabs, where opening a tab's address switches the tab: the tab screens
 * themselves, and the circles and the Today / Waiting for you block on the staff home tab (#339, #340).
 */
const insideTabs = (path) =>
  /^app\/[^/]+\/\(tabs\)\//.test(path) || path === 'components/staff-shortcuts.tsx' || path === 'components/staff-today.tsx';

/** Every router.push / navigate / replace in a file outside the tabs whose target is a tab's address. */
function tabLinksOutsideTabs() {
  const tabs = new Set(tabAddresses());
  const found = [];
  for (const [path, text] of sourceFiles()) {
    if (insideTabs(path)) continue;
    for (const match of text.matchAll(/router\.(push|navigate|replace)\(/g)) {
      const call = callText(text, match.index + match[0].length - 1);
      const targets = [...call.matchAll(/'(\/[^'?]*)/g)].map((m) => m[1]);
      if (!targets.some((target) => tabs.has(target))) continue;
      // "Back, or the list when nothing is under this screen" (a link or a push opened it): nothing to copy.
      if (match[1] === 'replace' && text.slice(Math.max(0, match.index - 80), match.index).includes('canGoBack()')) continue;
      found.push(`${path}: ${call.slice(0, 80)}`);
    }
  }
  return found;
}

test('the tab addresses are found (the guard below has something to guard)', () => {
  const tabs = tabAddresses();
  for (const address of ['/staff', '/staff/students', '/staff/follow-up', '/staff/attendance', '/student/me', '/student/my-practice']) {
    assert.ok(tabs.includes(address), address);
  }
});

test('no screen on top of the tabs opens a tab address (it would push a second copy of the tabs)', () => {
  assert.deepEqual(tabLinksOutsideTabs(), []);
});

test('the guard catches the pattern it is for', () => {
  const before = [
    "router.push({ pathname: '/staff/students', params: { status: 'notLeft' } })",
    "router.push('/staff/follow-up')",
    "router.push('/staff/attendance')",
  ];
  const tabs = new Set(tabAddresses());
  for (const call of before) {
    const target = call.match(/'(\/[^'?]*)/)[1];
    assert.ok(tabs.has(target), call);
  }
});

test('each stack copy shows the tab page, and the old places open the copy', () => {
  const copies = {
    'app/staff/class-list.tsx': './(tabs)/students',
    'app/staff/calls.tsx': './(tabs)/follow-up',
    'app/staff/mark-attendance.tsx': './(tabs)/attendance',
    'app/student/qr.tsx': './my-qr',
  };
  for (const [file, tab] of Object.entries(copies)) {
    assert.ok(existsSync(new URL(file, srcUrl)), file);
    assert.ok(src(file).includes(`from '${tab}'`), `${file} renders ${tab}`);
  }
  assert.match(src('screens/guru-home.tsx'), /pathname: '\/staff\/class-list', params: \{ status: 'notLeft' \}/);
  assert.match(src('screens/guru-home.tsx'), /pathname: '\/staff\/calls', params: \{ assignee:/);
  assert.match(src('screens/coordinator-home.tsx'), /router\.push\('\/staff\/mark-attendance'\)/);
  assert.match(src('screens/coordinator-home.tsx'), /pathname: '\/staff\/calls', params: \{ scope: 'mine' \}/);
  assert.match(src('screens/my-profile.tsx'), /router\.push\('\/student\/qr'\)/);
});

// ---------------------------------------------------------------- R1-02 My QR saved from the home (#303)

const myStudent = await import('../src/data/my-student.ts');

/** A fake database client answering the card query with `answer`, counting the calls. */
function fakeCardClient(answer) {
  const calls = { count: 0 };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      calls.count += 1;
      return typeof answer === 'function' ? answer() : answer;
    },
  };
  globalThis.__testSupabase = { from: () => chain };
  return calls;
}

test('the home saves the card once per run, so My QR works offline without having been opened', async () => {
  myStudent.clearSavedCard();
  const calls = fakeCardClient({ data: { full_name: 'Asha Rao', roll_no: 'MS-2026-0007', qr_token: 'tok-1' }, error: null });
  await myStudent.keepMyCardSaved('p1');
  assert.equal(calls.count, 1);
  assert.deepEqual(myStudent.savedCardFor('p1'), { fullName: 'Asha Rao', rollNo: 'MS-2026-0007', qrToken: 'tok-1' });
  await myStudent.keepMyCardSaved('p1');
  assert.equal(calls.count, 1, 'the home comes back into view: no second call in the same run');
  assert.equal(myStudent.savedCardFor('p2'), null, 'never shown to another login');
});

test('a failed save is tried again at the next home load; sign-out forgets the card and the run', async () => {
  myStudent.clearSavedCard();
  let online = false;
  const calls = fakeCardClient(() =>
    online
      ? { data: { full_name: 'Ravi', roll_no: null, qr_token: 'tok-2' }, error: null }
      : { data: null, error: { message: 'TypeError: Network request failed' } },
  );
  await myStudent.keepMyCardSaved('p3');
  assert.equal(myStudent.savedCardFor('p3'), null);
  online = true;
  await myStudent.keepMyCardSaved('p3');
  assert.equal(calls.count, 2);
  assert.equal(myStudent.savedCardFor('p3')?.qrToken, 'tok-2');
  myStudent.clearSavedCard();
  assert.equal(myStudent.savedCardFor('p3'), null);
  await myStudent.keepMyCardSaved('p3');
  assert.equal(calls.count, 3, 'after a sign-out the next login on the phone saves its card again');
  await myStudent.keepMyCardSaved('');
  assert.equal(calls.count, 3, 'no login, no call');
  delete globalThis.__testSupabase;
});

test('the student home asks for the card in its load', () => {
  assert.match(src('app/student/(tabs)/index.tsx'), /void keepMyCardSaved\(myId\)/);
});

// ---------------------------------------------------------------- R5-01 read time limit, no retry chain (#304)

const timed = await import('../src/lib/timed-fetch.ts');

test('reads get the short limit, writes and functions the longer one, uploads none', () => {
  const rest = 'https://x.supabase.co/rest/v1/students?select=*';
  assert.equal(timed.timeLimitFor(rest, 'GET'), timed.READ_TIMEOUT_MS);
  assert.equal(timed.timeLimitFor(rest, 'HEAD'), timed.READ_TIMEOUT_MS);
  assert.equal(timed.timeLimitFor('https://x.supabase.co/rest/v1/rpc/scan_qr', 'POST'), timed.REQUEST_TIMEOUT_MS);
  assert.equal(timed.timeLimitFor(rest, 'PATCH'), timed.REQUEST_TIMEOUT_MS);
  assert.equal(timed.timeLimitFor('https://x.supabase.co/storage/v1/object/media/a.mp3', 'POST'), null);
  assert.ok(timed.READ_TIMEOUT_MS <= 10_000 && timed.READ_TIMEOUT_MS < timed.REQUEST_TIMEOUT_MS);
  assert.match(timed.TIMEOUT_MESSAGE, /Network request failed/, 'screens still say "Could not reach the server"');
});

test('the database client does not retry a failed read (one limit, not 4 x 15 + 7 s)', () => {
  assert.match(src('lib/supabase.ts'), /db: \{ retry: false \}/);
});

test('a stalled read fails at its own limit through withTimeout', async () => {
  const stalled = (_input, init) =>
    new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const started = Date.now();
  await assert.rejects(timed.withTimeout(stalled, 20)('https://x.supabase.co/rest/v1/t', { method: 'GET' }), {
    message: timed.TIMEOUT_MESSAGE,
  });
  assert.ok(Date.now() - started < 1000);
});

// ---------------------------------------------------------------- R5-04 push failure visible (#305)

const pushState = await import('../src/lib/push-state.ts');

test('which push notice shows where', () => {
  const { pushNoticeFor } = pushState;
  assert.equal(pushNoticeFor('failed', 'home', false), 'failed');
  assert.equal(pushNoticeFor('failed', 'home', true), 'failed', 'Not now hides only the refusal notice');
  assert.equal(pushNoticeFor('denied', 'home', false), 'denied');
  assert.equal(pushNoticeFor('denied', 'home', true), null);
  assert.equal(pushNoticeFor('denied', 'profile', true), 'denied', 'My profile always says it');
  for (const quiet of ['unknown', 'on', 'off']) {
    assert.equal(pushNoticeFor(quiet, 'home', false), null, quiet);
    assert.equal(pushNoticeFor(quiet, 'profile', false), null, quiet);
  }
});

test('a refused or failed registration is tried again on return to the front, a working one is not', () => {
  assert.equal(pushState.pushNeedsRetry('failed'), true);
  assert.equal(pushState.pushNeedsRetry('denied'), true);
  assert.equal(pushState.pushNeedsRetry('on'), false);
  assert.equal(pushState.pushNeedsRetry('off'), false);
  pushState.setPushState('failed');
  assert.equal(pushState.pushState(), 'failed');
  pushState.setPushState('unknown');
  const layout = src('app/_layout.tsx');
  assert.match(layout, /next === 'active' && pushNeedsRetry\(\)\) void registerForPush\(\{ ask: false \}\)/);
  const push = src('lib/push.ts');
  for (const state of ["setPushState('off')", "setPushState('denied')", "setPushState(error ? 'failed' : 'on')", "setPushState('failed')", "setPushState('unknown')"]) {
    assert.ok(push.includes(state), state);
  }
  for (const file of ['app/student/(tabs)/index.tsx', 'screens/guru-home.tsx', 'screens/coordinator-home.tsx']) {
    assert.ok(src(file).includes('<PushNotice place="home" />'), file);
  }
  assert.ok(src('screens/my-profile.tsx').includes('<PushNotice place="profile" />'));
});

// ---------------------------------------------------------------- R3-01..05 the Guru's week-1 tools (#302)

const tools = await import('../src/lib/guru-tools.ts');
const { studentAdminErrorKey } = await import('../src/data/student-admin.ts');

test('the mentor picker offers active staff by name, without the mentor the student has', () => {
  const staff = [
    { id: 'c2', fullName: 'Vamsi', role: 'coordinator', active: true },
    { id: 'g', fullName: 'Guru', role: 'guru', active: true },
    { id: 'c1', fullName: 'Anand', role: 'coordinator', active: true },
    { id: 'off', fullName: 'Old', role: 'coordinator', active: false },
  ];
  assert.deepEqual(tools.mentorChoices(staff, 'c2').map((s) => s.id), ['c1', 'g']);
  assert.deepEqual(tools.mentorChoices(staff, null).map((s) => s.id), ['c1', 'g', 'c2'], 'a student with no mentor');
});

test('Set level sends only what changed, and refuses a joining date that is not a date or in the future', () => {
  const current = { levelId: 1, joinedOn: '2026-10-17' };
  const today = '2026-10-20';
  assert.deepEqual(tools.levelPatch(current, 3, '17-10-2026', today), { level_id: 3 });
  assert.deepEqual(tools.levelPatch(current, 1, '15-06-2019', today), { joined_on: '2019-06-15' });
  assert.deepEqual(tools.levelPatch(current, 2, '2019-06-15', today), { level_id: 2, joined_on: '2019-06-15' });
  assert.equal(tools.levelPatch(current, 1, '17-10-2026', today), null);
  assert.equal(tools.levelPatch(current, 1, '', today), null, 'an empty date keeps the record\'s');
  assert.equal(tools.levelPatch(current, 2, '31-02-2019', today), 'badDate');
  assert.equal(tools.levelPatch(current, 2, '21-10-2026', today), 'badDate');
  assert.equal(tools.levelPatch(current, 2, 'yesterday', today), 'badDate');
});

test('"Make a coordinator" wants the name typed: case, accents and spaces do not matter, a part is not enough', () => {
  assert.equal(tools.nameTypedRight('  lakshmi   devi ', 'Lakshmi Devi'), true);
  assert.equal(tools.nameTypedRight('krsna das', 'Kṛṣṇa Dās'), true);
  assert.equal(tools.nameTypedRight('Lakshmi', 'Lakshmi Devi'), false);
  assert.equal(tools.nameTypedRight('', ''), false, 'no name and no email: never enabled');
  assert.equal(tools.nameTypedRight('a@b.in', 'a@b.in'), true, 'without a name, the email');
});

test('the waiting list is a search: nothing before 2 letters, then name, email or 3+ phone digits', () => {
  const people = [
    { fullName: 'Lakshmi Devi', email: 'lakshmi@example.com', phone: '+91 98765 43215' },
    { fullName: 'Ravi Kumar', email: 'ravi@example.com', phone: null },
  ];
  assert.deepEqual(tools.findWaitingPeople(people, ''), []);
  assert.deepEqual(tools.findWaitingPeople(people, 'l'), []);
  assert.deepEqual(tools.findWaitingPeople(people, 'LAK').map((p) => p.fullName), ['Lakshmi Devi']);
  assert.deepEqual(tools.findWaitingPeople(people, 'ravi@').map((p) => p.fullName), ['Ravi Kumar']);
  assert.deepEqual(tools.findWaitingPeople(people, '43215').map((p) => p.fullName), ['Lakshmi Devi']);
  assert.deepEqual(tools.findWaitingPeople(people, 'example').length, 2);
});

test('the tools\' refusals have their own words; others fall back to the shared ones', () => {
  for (const code of ['not_allowed', 'level_guru_only', 'joined_on_invalid', 'mentor_not_staff', 'student_not_found', 'student_not_linked']) {
    assert.equal(studentAdminErrorKey(code), `studentTools.errors.${code}`);
  }
  assert.equal(studentAdminErrorKey('student_withdrawn'), 'common.studentWithdrawn');
  assert.equal(studentAdminErrorKey('TypeError: Network request failed'), 'common.networkError');
});

test('the screens use the tools: profile panel for the Guru, typed name, search-only waiting list', () => {
  assert.match(src('app/staff/students/[id].tsx'), /<GuruStudentTools student=\{student\} staff=\{staff\}/);
  assert.match(src('components/guru-student-tools.tsx'), /if \(profile\?\.role !== 'guru'\) return null;/);
  assert.match(src('app/staff/coordinators/[id].tsx'), /disabled=\{busy \|\| !nameTypedRight\(typedName/);
  const list = src('app/staff/coordinators/index.tsx');
  assert.ok(list.includes('<Columns>{found.map(waitingRow)}</Columns>'));
  assert.ok(!list.includes('board.waiting.map('), 'the whole queue is never drawn');
});

// ---------------------------------------------------------------- R2-08 ?ids= through web sign-in (#306)

/** Loads a fresh requested-path as if the web app had just opened at `pathname` + `search`. */
async function openWeb(pathname, search = '') {
  globalThis.__testOS = 'web';
  globalThis.window = { location: { pathname, search } };
  const mod = await import(`../src/auth/requested-path.ts?start=${Math.random()}`);
  delete globalThis.window;
  return mod;
}

const ID_A = '0e77a1b2-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const ID_B = 'f0e1d2c3-b4a5-4968-8776-655443322110';

test('Print QR cards keeps its ?ids= through sign-in', async () => {
  const app = await openWeb('/staff/qr-cards', `?ids=${ID_A},${ID_B}`);
  assert.equal(app.requestedPathFor('coordinator'), `/staff/qr-cards?ids=${ID_A},${ID_B}`);
  assert.equal(app.requestedPathFor('student'), null);
  app.forgetRequestedPath();
  assert.equal(app.requestedPathFor('coordinator'), null);
});

test('only record ids are kept, only for Print QR cards; tokens never ride along', async () => {
  const { keptQuery } = await openWeb('/');
  assert.equal(keptQuery('/staff/qr-cards', `ids=${ID_A},not-an-id,${ID_B}`), `?ids=${ID_A},${ID_B}`);
  assert.equal(keptQuery('/staff/qr-cards', '?ids=<script>'), '');
  assert.equal(keptQuery('/staff/qr-cards', '?access_token=secret'), '');
  assert.equal(keptQuery('/staff/students', `?ids=${ID_A}`), '');
  assert.equal(keptQuery(null, `?ids=${ID_A}`), '');
  const other = await openWeb('/student/announcements/7', `?ids=${ID_A}&access_token=x`);
  assert.equal(other.requestedPathFor('student'), '/student/announcements/7');
  other.rememberRequestedPath(`/staff/qr-cards?ids=${ID_A}`);
  assert.equal(other.requestedPathFor('guru'), '/staff/qr-cards', 'a remembered push path keeps no query');
});

// ---------------------------------------------------------------- the new words exist in en, te and hi

test('every new text is worded in en, te and hi', () => {
  const locales = Object.fromEntries(['en', 'te', 'hi'].map((l) => [l, JSON.parse(src(`i18n/locales/${l}.json`))]));
  const text = (lang, key) => key.split('.').reduce((o, k) => o?.[k], locales[lang]);
  const keys = [
    'push.offTitle', 'push.offBody', 'push.openSettings', 'push.notNow', 'push.failedTitle', 'push.failedBody',
    'studentTools.title', 'studentTools.chooseMentor', 'studentTools.setLevel', 'studentTools.unlink', 'studentTools.unlinkAsk',
    'studentTools.unlinkBody', 'studentTools.joinedInvalid', 'studentTools.errors.student_not_linked',
    'coordinators.waitingSearch', 'coordinators.waitingSearchHint', 'coordinators.waitingNoMatch',
    'coordinators.typeNameLabel', 'coordinators.typeNameHint',
  ];
  for (const key of keys) for (const lang of ['en', 'te', 'hi']) assert.ok(text(lang, key), `${lang}: ${key}`);
});
// ---------------------------------------------------------------- audit phase 4 B4-1 / B4-2 (#313-#315)

const { withMarked } = await import('../src/data/attendance.ts');

test('P5-04: a tap\'s answer changes "here now" at once, without waiting for the reload', () => {
  const today = {
    hereNow: [{ visitId: 1, checkIn: '2026-10-20T12:00:00Z', studentId: 'b', fullName: 'B', rollNo: 'R2', levelId: 1, locationCheck: 'inside', distanceM: 5 }],
    visitsToday: 3,
    readAt: 0,
  };
  const asha = { id: 'a', fullName: 'Asha', rollNo: 'R1', levelId: 2 };
  const inResult = { action: 'in', fullName: 'Asha', rollNo: 'R1', at: '2026-10-20T12:30:00Z', locationCheck: 'inside', distanceM: 3 };
  const afterIn = withMarked(today, asha, inResult);
  assert.deepEqual(afterIn.hereNow.map((v) => v.studentId), ['b', 'a']);
  assert.equal(afterIn.visitsToday, 4);
  assert.equal(afterIn.hereNow[1].checkIn, inResult.at);
  assert.equal(withMarked(afterIn, asha, inResult), afterIn, 'a second "in" for someone listed changes nothing');
  const afterOut = withMarked(afterIn, asha, { action: 'out', fullName: 'Asha', rollNo: 'R1', at: 'x', minutes: 30 });
  assert.deepEqual(afterOut.hereNow.map((v) => v.studentId), ['b']);
  assert.equal(afterOut.visitsToday, 4, 'a check-out is still a visit today');
  assert.deepEqual(withMarked(today, { ...asha, id: 'b' }, { action: 'already_out', fullName: 'B', rollNo: 'R2' }).hereNow, []);
  assert.equal(withMarked(today, asha, { action: 'already_in', fullName: 'Asha', rollNo: 'R1' }), today, 'unknown time: wait for the reload');
  const screen = src('app/staff/(tabs)/attendance.tsx');
  assert.ok(screen.includes('withMarked(current, student, result)'));
  assert.ok(!screen.includes('await loadToday();\n    setMarking'), 'the tap no longer waits for the reload');
  assert.ok(screen.includes('disabled: today === undefined || markingIds.has(student.id)'), 'other names stay tappable');
});

test('P2-01: every confirm question is announced; label-swap confirms call announce()', () => {
  const sites = {
    'app/staff/register.tsx': "register.acceptTitle",
    'app/staff/announcements/[id].tsx': "announcements.detail.deleteTitle",
    'app/staff/here-now.tsx': "hereNow.confirmTitle",
    'app/staff/syllabus/[id].tsx': "syllabus.untickTitle",
    'app/staff/database/import.tsx': "importStudents.askTitle",
    'app/staff/coordinators/[id].tsx': "coordinators.linkAsk",
    'app/staff/levels/item/[id].tsx': "syllabusEditor.retireAsk",
    'screens/event-detail.tsx': "events.detail.deleteTitle",
    'screens/poll-detail.tsx': "polls.deleteTitle",
  };
  for (const [file, key] of Object.entries(sites)) {
    const line = src(file).split('\n').find((l) => l.includes(key) && l.includes('<Notice'));
    assert.ok(line && /announced>/.test(line), `${file}: ${key}`);
  }
  assert.equal((src('app/staff/promotion/[id].tsx').match(/<Notice tone="info" title=\{t\('promotion\.(decide\.confirmTitle|withdraw\.ask)'.*announced>/g) ?? []).length, 2);
  for (const [file, key] of [
    ['app/student/practice-log.tsx', 'practiceLog.confirmDelete'],
    ['app/staff/assessments/[id].tsx', 'assessments.detail.deleteYes'],
    ['app/staff/announcements/[id].tsx', 'announcements.replies.deleteYes'],
    ['components/record-myself.tsx', 'recordMyself.deleteSure'],
  ]) {
    assert.ok(src(file).includes(`announce(t('${key}'))`), file);
  }
});

test('P2-03: count lines are live regions on Android too, and searches say how many were found', () => {
  assert.match(src('components/status-text.tsx'), /accessibilityLiveRegion="polite"/);
  for (const file of ['app/staff/(tabs)/students.tsx', 'app/staff/database/index.tsx', 'app/staff/reports.tsx', 'screens/notifications.tsx']) {
    assert.ok(!src(file).includes('role="status"'), `${file} uses StatusText`);
    assert.ok(src(file).includes('<StatusText'), file);
  }
  assert.ok(src('app/staff/(tabs)/attendance.tsx').includes("t('common.foundCount', { count: shown.length })"));
  assert.ok(src('app/staff/register.tsx').includes("t('common.foundCount', { count: waitingMatches.length })"));
  const locales = Object.fromEntries(['en', 'te', 'hi'].map((l) => [l, JSON.parse(src(`i18n/locales/${l}.json`))]));
  for (const lang of ['en', 'te', 'hi']) {
    assert.ok(locales[lang].common.foundCount_one && locales[lang].common.foundCount_other.includes('{{count}}'), lang);
  }
});

test('P3-01..04: large text — row buttons wrap, slow splash scrolls, grid names grow, tab names take two lines', () => {
  const row = src('components/list-row.tsx');
  assert.ok(row.includes('large && action ? styles.wrap : null') && row.includes("flexBasis: '100%'"));
  const splash = src('components/brand.tsx');
  assert.ok(splash.includes('<ScrollView') && splash.includes('contentContainerStyle={styles.slowSplash}'));
  assert.ok(splash.includes('flexGrow: 1'));
  const ring = src('components/module-ring.tsx');
  assert.ok(ring.includes('maxFontSizeMultiplier={inGrid ? undefined : 1.2}') && ring.includes('module={module} inGrid'));
  assert.match(src('components/tab-label.tsx'), /numberOfLines=\{2\}/);
  for (const file of ['app/staff/(tabs)/_layout.tsx', 'app/student/(tabs)/_layout.tsx']) {
    const layout = src(file);
    assert.ok(!/tabBarLabel: t\(/.test(layout), `${file}: every label is a tabLabel`);
    assert.ok(layout.includes("tabBarLabel: tabLabel(t('tabs.home'))"), file);
  }
  assert.ok(src('theme/use-theme.ts').includes('fontScale >= 1.15 ? Math.round(18 * fontScale) : 0'));
});

test('P5-01: long people lists are drawn 50 at a time', () => {
  const post = src('app/staff/announcements/[id].tsx');
  assert.ok(post.includes('notSeen.slice(0, notSeenShown)') && post.includes('seen.slice(0, seenShown)'));
  assert.ok(post.includes('const PEOPLE_PAGE = 50;'));
  const list = src('app/staff/(tabs)/students.tsx');
  assert.ok(list.includes('shown.slice(0, limit)') && list.includes('const STUDENT_PAGE = 50;'));
});

test('P4-02: the web page shows a splash in #root before the script loads, without any inline script', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const root = html.slice(html.indexOf('<div id="root">'));
  assert.ok(root.includes('class="first-splash"') && root.includes('Mridanga Seva'));
  assert.ok(root.includes('మృదంగ సేవ') && root.includes('मृदंग सेवा'));
  assert.ok(html.includes('prefers-reduced-motion: reduce'));
  assert.ok(!/<script/i.test(html), 'the site policy allows no inline script');
});