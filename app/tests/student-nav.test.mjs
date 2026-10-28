// Unit tests for the student's four tabs and Today's Practice (Sarvesh Prji's student spec, 27-10-2026;
// docs/DECISIONS.md #670-#678): the tabs and the old addresses, the Śrī Khol icon, Today's Practice, the bell, the
// sign-out warning and the terms. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { todayPractice } = await import('../src/lib/today-practice.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const has = (path) => existsSync(new URL(`../src/${path}`, import.meta.url));
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

const base = {
  items: [],
  taalNames: new Map(),
  lessonTitles: new Map(),
  goal: { days: 4, minutes: 15 },
  days: [],
  nextTitle: null,
  today: '2026-10-27',
};

// ---------------------------------------------------------------- Today's Practice (#673)

test("Today's Practice: a plan item a day, in the plan's order, repeating each week", () => {
  const items = [
    { kind: 'taal', taalId: 1, bpm: 80 },
    { kind: 'lesson', materialId: 9 },
    { kind: 'taal', taalId: 2, bpm: 60 },
  ];
  const input = { ...base, items, taalNames: new Map([[1, 'Kaherva'], [2, 'Dadra']]), lessonTitles: new Map([[9, 'Na stroke']]) };
  const seen = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].map((today) => todayPractice({ ...input, today }).topic);
  assert.deepEqual(seen.map((t) => t.kind), ['taal', 'lesson', 'taal', 'taal']);
  assert.equal(seen[0].name, seen[3].name, 'after the last item the first comes again');
  assert.notEqual(seen[0].name, seen[2].name);
  const taal = seen.find((t) => t.kind === 'taal');
  assert.ok(taal.bpm === 80 || taal.bpm === 60);
});

test("Today's Practice: items the student cannot open are left out; then the next item, then free practice", () => {
  const gone = { ...base, items: [{ kind: 'taal', taalId: 5, bpm: 70 }, { kind: 'lesson', materialId: 3 }] };
  assert.deepEqual(todayPractice({ ...gone, nextTitle: 'Tirakita' }).topic, { kind: 'next', title: 'Tirakita' });
  assert.deepEqual(todayPractice(gone).topic, { kind: 'free' });
});

test("Today's Practice: guna only for a taal (ekgun), minutes from the goal, Start / Continue / done by today's minutes", () => {
  const taal = { ...base, items: [{ kind: 'taal', taalId: 1, bpm: 80 }], taalNames: new Map([[1, 'Kaherva']]) };
  assert.equal(todayPractice(taal).guna, 1);
  assert.equal(todayPractice({ ...base, nextTitle: 'x' }).guna, null);
  assert.equal(todayPractice({ ...taal, goal: { days: 5, minutes: 20 } }).minutes, 20);
  const day = (on, minutes) => ({ on, minutes });
  assert.equal(todayPractice({ ...taal, days: [day('2026-10-26', 30)] }).state, 'start', 'yesterday does not count');
  const some = todayPractice({ ...taal, days: [day('2026-10-27', 5), day('2026-10-27', 4)] });
  assert.deepEqual([some.state, some.doneToday], ['continue', 9], 'two entries today are added up');
  assert.equal(todayPractice({ ...taal, days: [day('2026-10-27', 15)] }).state, 'done');
});

test("Today's Practice: the card is first on the home and on the Practice tab, Start opens the practice tools", () => {
  const card = src('components/today-practice-card.tsx');
  assert.match(card, /router\.push\('\/student\/practice'\)/);
  assert.match(card, /size="large"/);
  assert.match(card, /<IconBadge name="practice"/);
  for (const file of ['app/student/(tabs)/index.tsx', 'app/student/(tabs)/my-practice.tsx']) assert.ok(src(file).includes('<TodayPracticeCard'), file);
  // No new table or function: the plan, the taals and the days a student already reads.
  assert.doesNotMatch(src('data/today-practice.ts'), /\.rpc\(|\.from\(/);
});

// ---------------------------------------------------------------- the tabs and the old addresses (#670)

test('four tabs: Home, Learn, Practice, Me, each named, the open one by its filled icon', () => {
  const layout = src('app/student/(tabs)/_layout.tsx');
  const names = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ['index', 'learn', 'my-practice', 'me']);
  for (const key of ['tabs.home', 'tabs.learn', 'tabs.practice', 'tabs.me']) assert.ok(layout.includes(`tabBarLabel: tabLabel(t('${key}'))`), key);
  assert.match(layout, /tabBarIcon: tabIcon\('practice'\)/);
  assert.match(layout, /headerRight: HeaderBell/);
});

test('My QR, Updates and Śloka Study keep their addresses as screens on top of the tabs', () => {
  for (const file of ['app/student/my-qr.tsx', 'app/student/announcements.tsx', 'app/student/ishtagoshti.tsx']) assert.ok(has(file), file);
  for (const file of ['my-qr', 'announcements', 'ishtagoshti']) assert.ok(!has(`app/student/(tabs)/${file}.tsx`), file);
  // The practice tools stay at /student/practice: the reminder and What's new open them.
  assert.ok(has('app/student/practice.tsx') && !has('app/student/(tabs)/practice.tsx'));
  assert.match(src('lib/practice-reminder.ts'), /url: '\/student\/practice'/);
  // The lesson, event and assessment screens are where they were (another worker's).
  for (const file of ['app/student/lesson/[id].tsx', 'app/student/events/index.tsx', 'app/student/events/[id].tsx', 'app/student/assessments/index.tsx', 'app/student/assessments/[id].tsx']) {
    assert.ok(has(file), file);
  }
});

test('the home: compact band with the bell, Śloka Study across the row, the secondary cards', () => {
  const home = src('app/student/(tabs)/index.tsx');
  // The initials on the band open the Me tab (Praveen 28-10-2026); the tab switch is the home's, inside the tabs (R4-01).
  assert.match(home, /<HomeHeader name=\{name\} student onMe=\{\(\) => router\.navigate\('\/student\/me'\)\} \/>/);
  assert.match(home, /<ShortcutTiles shortcuts=\{sloka\} wide \/>/);
  for (const route of ['/student/progress', '/student/assessments', '/student/my-qr', '/student/events', '/student/practice-log', '/student/ishtagoshti']) {
    assert.ok(home.includes(`'${route}'`), route);
  }
  assert.doesNotMatch(home, /ModuleRing/);
  const header = src('components/home-header.tsx');
  assert.match(header, /student \? <UpdatesBell place="band" \/> : <InboxBell \/>/);
  assert.match(header, /student \? <MeButton name=\{name\} onPress=\{onMe\} \/> : <ProfileButton \/>/);
  assert.match(header, /<Initials name=\{name\} size=\{36\} onBand \/>/);
  assert.match(src('components/updates-bell.tsx'), /router\.push\('\/student\/announcements'\)/);
});

test('Me opens My QR, attendance, My Details, notifications, settings, Privacy & Data, and signs out', () => {
  const me = src('app/student/(tabs)/me.tsx');
  for (const route of ['my-qr', 'visits', 'about-you', 'notifications', 'profile', 'my-data', 'whats-new']) assert.ok(me.includes(`'/student/${route}'`), route);
  assert.match(me, /<SignOutButton/);
});

// ---------------------------------------------------------------- the Śrī Khol (#671)

test('Practice is drawn as the Śrī Khol: two heads of different size, outline, no font change', () => {
  const khol = src('components/khol-icon.tsx');
  const heads = [...khol.matchAll(/<Ellipse cx=\{([\d.]+)\} cy=\{12\} rx=\{([\d.]+)\} ry=\{([\d.]+)\}/g)].map((m) => Number(m[3]));
  assert.equal(heads.length, 2);
  assert.ok(heads[0] > heads[1] * 1.4, 'the bass head is clearly wider than the treble head');
  assert.match(khol, /viewBox="0 0 24 24"/);
  assert.match(khol, /strokeWidth=\{1\.5\}/);
  assert.match(src('components/icon.tsx'), /if \(name === 'practice'\) return <KholIcon/);
  assert.equal(get(locale('en'), 'tabs.practice'), 'Practice');
});

// ---------------------------------------------------------------- sign-out warning (#678)

test('sign-out warns while saves wait on the phone, and staying signed in is the first choice', () => {
  const button = src('components/sign-out-button.tsx');
  assert.match(button, /useQueuedCount\(profile\?\.id, WAITING_KINDS\)/);
  assert.match(button, /\['practice', 'scan', 'mark'\]/);
  assert.ok(button.indexOf("t('signOutWarning.stay')") < button.indexOf("t('signOutWarning.anyway')"));
  assert.match(button, /waiting > 0 \? setWarning\(true\) : run\(\)/);
});

// ---------------------------------------------------------------- terms (spec section 3)

test("English terms of the spec, keys kept; every new key in te and hi too", () => {
  const en = locale('en');
  const terms = {
    'tabs.news': 'Updates',
    'announcements.title': 'Updates',
    'tabs.ishtagoshti': 'Śloka Study',
    'progress.title': 'My Learning',
    'practiceLog.title': 'Practice History',
    'practice.planTitle': 'Weekly Practice',
    'practice.goalTitle': 'My Practice Goal',
    'about.title': 'My Details',
    'dataRights.title': 'Privacy & Data',
  };
  for (const [key, value] of Object.entries(terms)) assert.equal(get(en, key), value, key);
  for (const ns of ['todayPractice', 'learnTab', 'practiceTab', 'meTab', 'signOutWarning', 'updates']) {
    for (const lang of ['te', 'hi']) assert.deepEqual(Object.keys(get(locale(lang), ns)), Object.keys(en[ns]), `${lang} ${ns}`);
  }
});
