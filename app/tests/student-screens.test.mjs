// Unit tests for the student screens polish before launch (docs/DECISIONS.md #380-#389, Praveen 15-10-2026): the way to
// register on the first screen of Sign-in, the waiting screen's steps and its own check, My QR as a bright pass with
// the door moment, the weeks in a row on My attendance, titles that match their tabs, and the new texts in en/te/hi.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { mondayOf, weeksInARow } = await import('../src/lib/streak.ts');

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
  const qr = src('app/student/(tabs)/my-qr.tsx');
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
  assert.match(src('app/student/(tabs)/_layout.tsx'), /title: t\('tabs\.ishtagoshti'\)/);
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
  ];
  for (const lang of LANGS) {
    for (const key of keys) assert.ok(get(locale(lang), key)?.trim(), `${lang} ${key}`);
  }
});
