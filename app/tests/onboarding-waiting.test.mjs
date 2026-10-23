// Unit tests for the first-run fixes of the world-class audit 22-10-2026 (fixes 8 and 9): the shorter sign-up (#514),
// practice while waiting for the desk (#510-#512: the waiting page's section, its screens, what is kept on the device
// and forgotten at sign-out) and their texts in English, Telugu and Hindi. The database side (0057) is in
// supabase/tests/smoke-test.mjs; the /sign-up link in requested-path.test.mjs. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import './stubs/register.mjs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const store = await import('../src/data/waiting-store.ts');

test('fix 9: the sign-up asks only what joining needs (#514)', () => {
  const signUp = src('app/sign-up.tsx');
  const order = /const ORDER: readonly Field\[\] = \[([^\]]+)\]/.exec(signUp)[1].replace(/\s+/g, ' ');
  assert.equal(order, "'name', 'email', 'password', 'dob', 'parentName', 'parentRelation', 'parentEmail', 'parentPhone', 'centre', 'notice'");
  for (const gone of ['confirmPassword', "label={t('about.phone')}", "t('signUp.gender')", 'InstrumentChecks', 'dikshaName', 'setGender']) {
    assert.ok(!signUp.includes(gone), `no ${gone} on the sign-up`);
  }
  // Kept: the privacy-notice tick with its version, the date of birth, and the whole under-18 parent block (0051).
  assert.match(signUp, /noticeVersion: PRIVACY_NOTICE_VERSION/);
  assert.match(signUp, /if \(!noticeRead\) errors\.notice = 'signUp\.noticeRequired'/);
  assert.match(signUp, /<BirthDateField/);
  for (const field of ['parentName', 'parentRelation', 'parentEmail', 'parentPhone']) assert.match(signUp, new RegExp(`ref=\\{target\\('${field}'\\)\\}`));
  assert.match(signUp, /else if \(age === 'minor'\) Object\.assign\(errors, checkParentDetails\(parentForm, email\)\)/);
  // One centre is chosen by itself; the choice shows only with more.
  assert.match(signUp, /if \(result\.centres\.length === 1\) \{[\s\S]*?setCentreId\(result\.centres\[0\]\.id\)/);
  assert.match(signUp, /\{lists && lists\.centres\.length > 1 \? \(/);
  // Only these go with the sign-up; the rest is asked in About you, which has them all.
  const details = /signUp\(cleanName\(name\), email\.trim\(\), password, \{([\s\S]*?)\n {4}\}\);/.exec(signUp)[1];
  assert.deepEqual([...details.matchAll(/^ {6}(\w+)[:,]/gm)].map((m) => m[1]), ['dob', 'centreId', 'noticeVersion', 'parent']);
  const youPart = src('components/about-fields.tsx');
  for (const part of ['about.dikshaName', 'InstrumentChecks options={options.instrument}', "t('about.gender')"]) assert.ok(youPart.includes(part), part);
  assert.match(src('data/about.ts'), /patch\.diksha_name = /);
});

test('fix 8: the waiting page offers practice only when the database says so, and the screens are the pending area\'s', () => {
  const pending = src('app/pending.tsx');
  assert.match(pending, /\{waitingForDesk && typeof practiceLevel === 'number' \? \(/);
  for (const path of ['/waiting/practice', '/waiting/mantra', '/waiting/lessons']) assert.ok(pending.includes(`router.push('${path}')`), path);
  const layout = src('app/_layout.tsx');
  const pendingGuard = /<Stack\.Protected guard=\{area === 'pending'\}>([\s\S]*?)<\/Stack\.Protected>/.exec(layout)[1];
  assert.match(pendingGuard, /<Stack\.Screen name="waiting" \/>/);
  for (const file of ['_layout', 'practice', 'mantra', 'lessons', 'lesson/[id]']) assert.ok(existsSync(new URL(`../src/app/waiting/${file}.tsx`, import.meta.url)), file);
  assert.match(src('app/waiting/practice.tsx'), /<PracticeTools area="waiting" \/>/);
  assert.match(src('app/waiting/mantra.tsx'), /<MantraReader area="waiting" \/>/);
  // The tools only: no timer, log, plan, goal or reminder (a student's own record) for area waiting.
  assert.match(src('screens/practice-tools.tsx'), /const isStudent = \(area === 'student' && profile\?\.role === 'student'\) \|\| area === 'me';/);
  assert.match(src('components/practice-more.tsx'), /area === 'waiting' \? '\/waiting\/mantra'/);
  assert.match(src('screens/mantra-reader.tsx'), /area === 'waiting' \? '\/waiting\/practice'/);
  // The function first: before 0057 (PGRST202) nothing is offered.
  assert.match(src('data/waiting.ts'), /error\.code === 'PGRST202' \? null/);
});

test('fix 8: the "may practise" answer is kept per login, the lessons list too, and both go at sign-out', () => {
  store.saveWaitingAccess('me', 1);
  assert.equal(store.savedWaitingAccess('me'), 1);
  assert.equal(store.savedWaitingAccess('someone-else'), undefined, 'another login on this device gets no answer from it');
  store.saveWaitingAccess('me', null);
  assert.equal(store.savedWaitingAccess('me'), null);
  store.saveBeginnerLessons([{ id: 5, title: 'How to sit', kind: 'youtube', url: 'https://youtu.be/x', body: null }]);
  assert.equal(store.savedBeginnerLessons()?.[0].title, 'How to sit');
  store.forgetWaitingPractice();
  assert.equal(store.savedWaitingAccess('me'), undefined);
  assert.equal(store.savedBeginnerLessons(), null);
});

test('the new texts are in English, Telugu and Hindi (te/hi drafts), with the same placeholders', () => {
  const [en, te, hi] = ['en', 'te', 'hi'].map(locale);
  const keys = [...Object.keys(en.waiting).map((k) => ['waiting', k]), ['signUp', 'laterNote'], ['signUp', 'laterNoteMinor']];
  assert.equal(Object.keys(en.waiting).length, 18);
  for (const [group, key] of keys) {
    for (const [lang, strings] of [['te', te], ['hi', hi]]) {
      const text = strings[group]?.[key];
      assert.ok(typeof text === 'string' && text.trim() !== '' && text !== en[group][key], `${lang} ${group}.${key}`);
      assert.deepEqual(text.match(/\{\{\w+\}\}/g) ?? [], en[group][key].match(/\{\{\w+\}\}/g) ?? [], `${lang} ${group}.${key} placeholders`);
    }
  }
  assert.ok(!te.waiting.closedBody.includes('అనుమతి') && te.waiting.closedBody.includes('సమ్మతి'), 'consent is సమ్మతి (P1-01)');
});
