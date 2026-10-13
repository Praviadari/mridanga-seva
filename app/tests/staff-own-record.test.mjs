// Unit tests for "Coordinators are students too" (migration 0061, docs/DECISIONS.md #316-#321): Me in the staff
// app for a staff member's own student record, the own_record / own_mentor / staff_login_linked messages, the
// mentor picker without the record's own login, and the Guru's link on Coordinators.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import './stubs/register.mjs';

const srcUrl = new URL('../src/', import.meta.url);
const src = (path) => readFileSync(new URL(path, srcUrl), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const at = (root, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), root);

const { ownAreaOf } = await import('../src/lib/own-area.ts');
const { fallbackErrorKey } = await import('../src/data/errors.ts');
const { mentorChoices } = await import('../src/lib/guru-tools.ts');
const myStudent = await import('../src/data/my-student.ts');

// ---------------------------------------------------------------- the own area of the student screens (#319)

test('the student screens know whether they are a student\'s or Me in the staff app', () => {
  assert.equal(ownAreaOf('/student/progress'), 'student');
  assert.equal(ownAreaOf('/student'), 'student');
  assert.equal(ownAreaOf('/staff/me/progress'), 'me');
  assert.equal(ownAreaOf('/staff/me'), 'me');
  assert.equal(ownAreaOf('/staffing'), 'student', 'only the /staff area');
});

test('Back home and the practice log follow the area', () => {
  for (const file of ['app/student/progress.tsx', 'app/student/visits.tsx']) {
    assert.match(src(file), /ownAreaOf\(usePathname\(\)\)/, file);
    assert.match(src(file), /router\.dismissTo\(area === 'me' \? '\/staff\/me' : '\/student'\)/, file);
  }
  for (const file of ['components/practice-parts.tsx', 'screens/practice-tools.tsx']) {
    assert.match(src(file), /area === 'me' \? '\/staff\/me\/practice-log' : '\/student\/practice-log'/, file);
  }
  assert.match(src('screens/practice-tools.tsx'), /\|\| area === 'me';/, 'Me > Practice logs practice like a student');
});

// ---------------------------------------------------------------- Me (#319)

test('Me has the student\'s circles and reuses the student screens, no copies', () => {
  const me = src('app/staff/me/index.tsx');
  for (const path of ['/staff/me/qr', '/staff/me/progress', '/staff/me/visits', '/staff/me/practice']) {
    assert.ok(me.includes(`router.push('${path}')`), path);
  }
  const reused = {
    'app/staff/me/qr.tsx': "from '../../student/(tabs)/my-qr'",
    'app/staff/me/progress.tsx': "from '../../student/progress'",
    'app/staff/me/visits.tsx': "from '../../student/visits'",
    'app/staff/me/practice-log.tsx': "from '../../student/practice-log'",
    'app/staff/me/practice.tsx': '<PracticeTools area="me" />',
  };
  for (const [file, text] of Object.entries(reused)) {
    assert.ok(existsSync(new URL(file, srcUrl)), file);
    assert.ok(src(file).includes(text), `${file} uses ${text}`);
  }
  assert.match(me, /void keepMyCardSaved\(myId\)/, 'My QR is saved on the phone from Me too');
});

test('the Me circle is on the staff homes only when the login has its own record', () => {
  const shortcuts = src('components/staff-shortcuts.tsx');
  assert.match(shortcuts, /\.\.\.\(me \? \[\{ key: 'me'.*router\.push\('\/staff\/me'\)/s);
  assert.match(shortcuts, /me = false/, 'hidden by default');
  for (const file of ['screens/coordinator-home.tsx', 'screens/guru-home.tsx']) {
    assert.match(src(file), /hasOwnRecord\(myId\)/, file);
    assert.match(src(file), /me=\{me\}/, file);
  }
});

/** A fake database client answering the card query with `answer`. */
function fakeCardClient(answer) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => (typeof answer === 'function' ? answer() : answer) };
  globalThis.__testSupabase = { from: () => chain };
}

test('hasOwnRecord: the server decides; without internet the card saved on this phone does', async () => {
  myStudent.clearSavedCard();
  fakeCardClient({ data: null, error: null });
  assert.equal(await myStudent.hasOwnRecord('c1'), false, 'a coordinator without an own record: no Me');
  fakeCardClient({ data: { full_name: 'Asha Sixtyone', roll_no: 'MS-2026-0061', qr_token: 'tok-61' }, error: null });
  assert.equal(await myStudent.hasOwnRecord('c1'), true, 'linked: Me');
  assert.equal(myStudent.savedCardFor('c1')?.qrToken, 'tok-61', 'and the card is saved on the way');
  fakeCardClient({ data: null, error: { message: 'TypeError: Network request failed' } });
  assert.equal(await myStudent.hasOwnRecord('c1'), true, 'offline at the door: Me stays, from the saved card');
  assert.equal(await myStudent.hasOwnRecord('c2'), false, 'never another login\'s card');
  assert.equal(await myStudent.hasOwnRecord(''), false);
  myStudent.clearSavedCard();
  delete globalThis.__testSupabase;
});

// ---------------------------------------------------------------- messages (#318-#320)

const NEW_KEYS = [
  'common.ownRecord', 'common.ownMentor', 'common.staffLoginLinked',
  'me.title', 'me.intro', 'me.noRecordTitle', 'me.noRecordBody',
  'coordinators.ownTitle', 'coordinators.ownHint', 'coordinators.ownSelf', 'coordinators.ownAsk', 'coordinators.ownAskBody',
  'coordinators.ownLink', 'coordinators.ownLinked', 'coordinators.ownUnlink', 'coordinators.ownUnlinkAsk',
  'coordinators.ownUnlinkBody', 'coordinators.ownUnlinked',
  'coordinators.errors.profile_not_staff', 'coordinators.errors.staff_has_record',
  'profile.ownTitle', 'profile.ownBody', 'profile.staffLogin', 'studentTools.unlinkStaffBody', 'studentTools.unlinkedStaff',
];

test('own_record, own_mentor and staff_login_linked have one message, from every screen', () => {
  assert.equal(fallbackErrorKey('own_record'), 'common.ownRecord');
  assert.equal(fallbackErrorKey('own_mentor'), 'common.ownMentor');
  assert.equal(fallbackErrorKey('staff_login_linked'), 'common.staffLoginLinked');
  assert.equal(fallbackErrorKey('student_withdrawn'), 'common.studentWithdrawn', '(control) unchanged');
  assert.equal(fallbackErrorKey('something else'), 'common.genericError', '(control) unchanged');
});

test('every new text is in English, Telugu and Hindi', () => {
  for (const lang of ['en', 'te', 'hi']) {
    const root = locale(lang);
    for (const key of NEW_KEYS) {
      const text = at(root, key);
      assert.ok(typeof text === 'string' && text.trim() !== '', `${lang} ${key}`);
    }
  }
  const en = locale('en');
  assert.ok(at(en, 'coordinators.ownAsk').includes('{{student}}') && at(locale('te'), 'coordinators.ownAsk').includes('{{student}}'));
});

// ---------------------------------------------------------------- the mentor picker and the profile (#318, #319)

test('the mentor picker never offers the record\'s own login, nor the mentor it has', () => {
  const staff = [
    { id: 'asha', fullName: 'Asha', role: 'coordinator', active: true },
    { id: 'bindu', fullName: 'Bindu', role: 'coordinator', active: true },
    { id: 'chitra', fullName: 'Chitra', role: 'coordinator', active: true },
    { id: 'off', fullName: 'Off', role: 'coordinator', active: false },
  ];
  assert.deepEqual(mentorChoices(staff, 'bindu', 'asha').map((s) => s.id), ['chitra']);
  assert.deepEqual(mentorChoices(staff, null).map((s) => s.id), ['asha', 'bindu', 'chitra'], '(control) a student\'s record');
  assert.match(src('components/guru-student-tools.tsx'), /mentorChoices\(staff, student\.mentorId, student\.loginId\)/);
});

test('on their own record a staff member sees the note, not the buttons that mark themselves', () => {
  const profile = src('app/staff/students/[id].tsx');
  assert.match(profile, /const ownRecord = student\.loginId !== null && student\.loginId === signedIn\?\.id;/);
  assert.match(profile, /\{ownRecord \? \(\s*<Notice tone="info" title=\{t\('profile\.ownTitle'\)\}>/);
  assert.match(profile, /\{ownRecord \? null : \(\s*<Button[\s\S]*?profile\.tickSyllabus/);
  assert.match(src('components/guru-student-tools.tsx'), /\{ownRecord \? null : \(/, 'the Guru sets no level on their own record');
});

test('the Guru links a staff login to its own record with link_staff_record, and unlinks as for a student', () => {
  const data = src('data/coordinators.ts');
  assert.match(data, /supabase\.rpc\('link_staff_record', \{ p_profile: profileId, p_student: studentId \}\)/);
  assert.match(data, /'profile_not_staff',\s*'staff_has_record',/);
  const person = src('app/staff/coordinators/[id].tsx');
  assert.match(person, /linkOwnRecord\(person\.id, asking\.own\.id\)/);
  assert.match(person, /unlinkLogin\(own\.id\)/);
  assert.ok(person.includes('details={[`${own.rollNo} · ${levelName(t, own.levelId)} · ${statusName(t, own.status)}`]}'), 'the own record row names it');
  assert.match(person, /\) : isMe \? \(\s*<AppText tone="muted">\{t\('coordinators\.ownSelf'\)\}/, 'the Guru\'s own record: the SQL editor');
});
