// Unit tests for the student screens polish before launch (docs/DECISIONS.md #380-#389, Praveen 15-10-2026): the way to
// register on the first screen of Sign-in, the waiting screen's steps and its own check, My QR as a bright pass with
// the door moment, the weeks in a row on My attendance, titles that match their tabs, and the new texts in en/te/hi.
// Batch 2 (#383-#385): the assessment's mark first, Practice tools with Start at the top, My profile card first.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { mondayOf, weeksInARow } = await import('../src/lib/streak.ts');
const { newestReviewed, recordingNumber, shownKind } = await import('../src/lib/assessment-view.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const get = (obj, key) => key.split('.').reduce((o, p) => o?.[p], obj);
const LANGS = ['en', 'te', 'hi'];

test('weeks start on Monday', () => {
  assert.equal(mondayOf('2026-10-12'), '2026-10-12'); // a Monday
  assert.equal(mondayOf('2026-10-15'), '2026-10-12'); // Thursday
  assert.equal(mondayOf('2026-10-18'), '2026-10-12'); // Sunday belongs to the week before it
  assert.equal(mondayOf('2026-10-01'), '2026-09-28'); // across a month
});

test('weeks in a row: counted back from this week, or from last week while this week has no visit', () => {
  const sundays = ['2026-10-11', '2026-10-04', '2026-09-27'];
  assert.equal(weeksInARow(sundays, '2026-10-15'), 3); // nothing yet this week: the run is not broken
  assert.equal(weeksInARow([...sundays, '2026-10-15'], '2026-10-15'), 4);
  assert.equal(weeksInARow(['2026-10-11', '2026-09-27'], '2026-10-15'), 1); // a missed week ends the run
  assert.equal(weeksInARow(['2026-09-27'], '2026-10-15'), 0); // last week missed too
  assert.equal(weeksInARow([], '2026-10-15'), 0);
  assert.equal(weeksInARow(['2026-10-12', '2026-10-12', '2026-10-14'], '2026-10-15'), 1); // several visits, one week
});

test('Sign-in: New student registration comes before the sign-in form, at the foot only after an email link (#380)', () => {
  const signIn = src('app/sign-in.tsx');
  const top = signIn.indexOf('{linkProblem ? null : <NewHere />}');
  assert.ok(top > 0, 'NewHere at the top when there is no email-link problem');
  assert.ok(top < signIn.indexOf("t('signIn.title')"), 'before the Sign in section');
  assert.ok(signIn.includes('{linkProblem ? <NewHere /> : null}'), 'at the foot after an email link');
  assert.ok(signIn.includes("router.push('/sign-up')"));
});

test('Waiting for access: three steps and a check by itself every 30 s while waiting for the desk (#380)', () => {
  const pending = src('app/pending.tsx');
  assert.match(pending, /AUTO_CHECK_MS = 30_000/);
  assert.match(pending, /AppState\.addEventListener\('change'/);
  assert.match(pending, /waitingForDesk \? t\('pending\.almostTitle'\) : t\('pending\.title'\)/);
  assert.match(pending, /<JoinSteps email=/);
  const steps = src('components/join-steps.tsx');
  for (const key of ['stepAccount', 'stepDesk', 'stepDeskHint', 'stepQr', 'stepQrHint', 'stateDone', 'stateNow']) {
    assert.ok(steps.includes(`t('pending.${key}'`), key);
  }
});

test('My QR: a white pass in both modes, and a green check-in that buzzes only when the scan lands on screen (#381)', () => {
  const qr = src('app/student/my-qr.tsx');
  assert.match(qr, /backgroundColor: qrColours\.light/);
  assert.match(qr, /lightPalette\.bar/);
  assert.match(qr, /<Notice tone="success" haptic=\{landed\}/);
  assert.match(qr, /const landed = sawNotYet && door\?\.kind === 'in'/);
  assert.match(qr, /<MoreText text=\{t\('myQr\.howTo'\)\} \/>/);
  assert.ok(!qr.includes('TEMP'), 'no preview lines left');
});

test('My attendance: this week and weeks in a row, no "days since your last visit" (#382)', () => {
  const visits = src('app/student/visits.tsx');
  assert.ok(visits.includes("t('visitHistory.weeksInARow')"));
  assert.ok(!visits.includes('daysSinceVisit'));
  assert.match(src('screens/visit-history.tsx'), /typeof top === 'function' \? top\(history\) : top/);
});

test('titles match their tabs: News, Slokas, Events & polls (#382)', () => {
  for (const lang of LANGS) {
    const l = locale(lang);
    assert.equal(l.announcements.title, l.tabs.news, `${lang} News`);
    assert.equal(l.events.homeTitle, l.events.module, `${lang} Events & polls`);
  }
  // Śloka Study is a screen on top of the tabs since #670; its header says what the home's shortcut says.
  assert.match(src('app/student/_layout.tsx'), /name="ishtagoshti" options=\{\{ title: t\('tabs\.ishtagoshti'\) \}\}/);
  assert.match(src('app/student/(tabs)/index.tsx'), /label: t\('tabs\.ishtagoshti'\)/);
});

test('About you no longer points at "the name above" (#382)', () => {
  assert.ok(src('components/about-fields.tsx').includes("t('about.dikshaHintNoName')"));
  for (const lang of LANGS) assert.ok(!/above|పైన|ऊपर/.test(get(locale(lang), 'about.dikshaHintNoName')), lang);
});

test('the new texts exist in English, Telugu and Hindi', () => {
  const keys = [
    'myQr.statusInBody',
    'pending.almostTitle',
    'pending.stepAccount',
    'pending.stepDesk',
    'pending.stepDeskHint',
    'pending.stepQr',
    'pending.stepQrHint',
    'pending.stateDone',
    'pending.stateNow',
    'about.dikshaHintNoName',
    'visitHistory.weeksInARow',
    'assessments.submit.recordingName',
    'assessments.submit.markTitle',
    'practice.timerIdle',
    'practice.timerStartNow',
    'myProfile.rollLine',
    'myProfile.accountTitle',
    'myProfile.accountHintStudent',
    'myProfile.accountName',
    'myProfile.editName',
    'myProfile.editDetails',
  ];
  for (const lang of LANGS) {
    for (const key of keys) assert.ok(get(locale(lang), key)?.trim(), `${lang} ${key}`);
    for (const key of ['number', 'date']) assert.ok(get(locale(lang), 'assessments.submit.recordingName').includes(`{{${key}}}`), `${lang} {{${key}}}`);
    assert.ok(get(locale(lang), 'myProfile.rollLine').includes('{{rollNo}}'), `${lang} {{rollNo}}`);
  }
});

test('assessment: the newest reviewed recording, numbers counted from the first, an app recording shown as audio (#383)', () => {
  // Newest first, as fetchAssignment gives them.
  const subs = [{ id: 3, reviewedAt: null }, { id: 2, reviewedAt: '2026-10-04T10:00:00Z' }, { id: 1, reviewedAt: '2026-10-03T10:00:00Z' }];
  assert.equal(newestReviewed(subs)?.id, 2);
  assert.equal(newestReviewed([{ id: 1, reviewedAt: null }]), null);
  assert.equal(newestReviewed([]), null);
  assert.deepEqual([0, 1, 2].map((i) => recordingNumber(i, 3)), [3, 2, 1]);
  // The names the app gives its own recordings, in every language.
  for (const lang of LANGS) {
    const l = locale(lang);
    assert.equal(shownKind({ name: `${l.recording.fileName}.webm`, kind: 'video' }), 'audio', `${lang} recording`);
    assert.equal(shownKind({ name: `${l.recording.voiceNoteName}.webm`, kind: 'video' }), 'audio', `${lang} voice note`);
  }
  assert.equal(shownKind({ name: 'recording.m4a', kind: 'audio' }), 'audio');
  assert.equal(shownKind({ name: 'class video.webm', kind: 'video' }), 'video'); // a chosen video stays a video
  assert.equal(shownKind({ name: 'VID_2026.mp4', kind: 'video' }), 'video');
  assert.equal(shownKind({ name: 'notation.pdf', kind: 'pdf' }), 'pdf');
});

test('assessment: the mark comes before the task, recordings by number and day (#383)', () => {
  const screen = src('app/student/assessments/[id].tsx');
  const mark = screen.indexOf('<MarkCard submission={marked}');
  assert.ok(mark > 0, 'the mark card');
  assert.ok(mark < screen.indexOf('<Section title={a.title}'), 'before the task');
  assert.match(screen, /const marked = newestReviewed\(submissions\)/);
  assert.match(screen, /t\('assessments\.submit\.recordingName'/);
  assert.match(screen, /name=\{recordingName\(i\)\}/);
  assert.ok(!screen.includes("t('assessments.review.sentAt'"), 'no "Sent 03-10-2026 21:44" line');
  const parts = src('components/assessment-parts.tsx');
  assert.match(parts, /const kind = shownKind\(file\)/);
  assert.match(parts, /\{name \?\? file\.name\}/);
});

test('Practice tools: a slim timer line, Start right under the tempo, beats 2 to 8 in one row (#384)', () => {
  const tools = src('screens/practice-tools.tsx');
  // Since #400 the line also tells the screen when it saved practice, and the tempo is the trainer's while it runs.
  assert.match(tools, /<PracticeTimerLine profileId=\{profileId\} onSaved=\{practiceSaved\} \/>/);
  assert.ok(!tools.includes('PracticeTimerCard'));
  assert.match(tools, /<Section icon="practice" title=\{t\('practice\.metronome'\)\}/);
  assert.match(tools, /<TempoControl bpm=\{tempo\} onChange=\{changeTempo\}>\s*\{startButton\(false\)\}/);
  assert.match(tools, /<TempoControl bpm=\{tempo\} onChange=\{changeTempo\}>\s*\{startButton\(!taal\)\}/);
  // The Start button sits between the number and the −5 … +5 steps.
  const tempo = tools.slice(tools.indexOf('function TempoControl'));
  assert.ok(tempo.indexOf("t('practice.bpm'") < tempo.indexOf('{children}'));
  assert.ok(tempo.indexOf('{children}') < tempo.indexOf('styles.steps'));
  assert.match(tools, /segmented\s+label=\{t\('practice\.beatsInBar'\)\}/);
  const choices = src('components/choice-group.tsx');
  assert.match(choices, /segmentedRow: \{\s*flexWrap: 'nowrap'/);
  assert.match(src('components/appearance-picker.tsx'), /<ChoiceGroup<AppearanceChoice>\s+segmented/);
});

test('My profile: who you are first, then language and appearance, then the folded account; no phone for a student (#385)', () => {
  const profile = src('screens/my-profile.tsx');
  const card = profile.indexOf('<PersonHeader\n');
  const language = profile.indexOf('<LanguagePicker />');
  const appearance = profile.indexOf('<AppearancePicker />');
  const account = profile.indexOf("t('myProfile.accountTitle')");
  const about = profile.indexOf("t('about.cardTitle')");
  const signOut = profile.indexOf('<SignOutButton');
  assert.ok(card > 0 && card < language && language < appearance && appearance < account && account < about && about < signOut);
  assert.match(profile, /chips=\{\{ levelId: student\.levelId \}\}/);
  assert.match(profile, /t\('myProfile\.rollLine', \{ rollNo: student\.rollNo \}\)/);
  assert.match(profile, /\{isStudent \? null : \(\s*<TextField kind="phone"\s+label=\{t\('myProfile\.phoneLabel'\)\}/);
  assert.match(profile, /const details = isStudent \? \{ fullName \} : \{ fullName, phone: phone \?\? '' \}/);
  // A form without a phone leaves the account's phone as it is.
  const data = src('data/my-profile.ts');
  // ... and a typed one is saved as E.164 (#324).
  assert.match(data, /\.\.\.\(details\.phone === undefined \? \{\} : \{ phone: savedPhone\(details\.phone\) \}\)/);
  assert.match(src('data/visits.ts'), /select\('id, roll_no, full_name, level_id'\)/);
  for (const lang of LANGS) {
    const l = locale(lang);
    for (const gone of ['rollTitle', 'rollNo', 'rollName', 'detailsTitle', 'role']) assert.equal(l.myProfile[gone], undefined, `${lang} ${gone}`);
  }
});
