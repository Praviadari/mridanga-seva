// Unit tests for the forms fix (docs/DECISIONS.md #267-#270): person names (letters of any script,
// no digits), the phone box (digits only), the email check, and the date of birth's calendar range
// and the typed form Register a student keeps. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { checkPersonName, cleanName, isNameLetter, nameError } = await import('../src/lib/person-name.ts');
const { typedPhone, toE164 } = await import('../src/lib/phone.ts');
const { isValidEmail } = await import('../src/lib/email.ts');
const { birthCheck, partsOfTyped, pickerRange, typedOfParts } = await import('../src/lib/birth-date.ts');

test('names: English, Telugu, Hindi and other scripts are accepted', () => {
  for (const name of [
    'Praveen Kumar',
    'K. Rama-Krishna',
    "D'Souza",
    'D’Souza',
    'Rao Jr.',
    'José Ñúñez',
    'ప్రవీణ్ కుమార్', // Telugu with vowel signs and virama
    'శ్రీనివాస్', // Telugu conjunct
    'प्रवीण कुमार', // Hindi
    'श्री राधा-कृष्ण दास', // Hindi with a hyphen
    'க்ருஷ்ணா', // Tamil
    'Gaura‌Das', // a zero-width non-joiner from an Indic keyboard
  ]) {
    assert.equal(checkPersonName(name), null, name);
  }
});

test('names: digits of any script are refused', () => {
  for (const name of ['Praveen 2', 'R2D2', 'ప్రవీణ్ ౩', 'प्रवीण ३', '१२३', 'Ram１']) {
    assert.equal(checkPersonName(name), 'digits', name);
  }
  assert.equal(nameError('Praveen 2'), 'validation.nameDigits');
});

test('names: signs, emoji, leading or doubled separators are refused', () => {
  for (const name of ['Praveen@home', 'Ram_Das', 'Ram!', 'Ram 🙏', '-Ram', '.Ram', 'Ram--Das', "Ram''", 'Ram-', 'Ram, Das', 'Ram।']) {
    assert.equal(checkPersonName(name), 'symbols', name);
  }
  assert.equal(nameError('Ram!'), 'validation.nameSymbols');
});

test('names: required, too short, too long, optional', () => {
  assert.equal(checkPersonName('   '), 'required');
  assert.equal(nameError(''), 'validation.nameRequired');
  assert.equal(nameError('', {}, 'about.errors.nameRequired'), 'about.errors.nameRequired');
  assert.equal(checkPersonName('', { required: false }), null);
  assert.equal(checkPersonName('A'), 'tooShort');
  assert.equal(checkPersonName('A.'), 'tooShort');
  assert.equal(checkPersonName('Ab'), null);
  assert.equal(checkPersonName('a'.repeat(81)), 'tooLong');
  assert.equal(checkPersonName('a'.repeat(100), { max: 100 }), null);
});

test('names: kept trimmed with single spaces, in Unicode NFC', () => {
  assert.equal(cleanName('  Praveen   Kumar  '), 'Praveen Kumar');
  assert.equal(checkPersonName('  Praveen   Kumar  '), null);
  // e + combining acute (two codes) is kept as é (one code), as the SQL clean_person_name does.
  assert.equal(cleanName('José'), 'José');
  assert.equal(cleanName('José').length, 4);
  // Devanagari क + nukta is composed where Unicode allows; the name stays valid either way.
  assert.equal(checkPersonName('क़ारिम'), null);
});

test('names: the fallback letter ranges (engines without \\p{L}) agree on common scripts', () => {
  for (const char of ['a', 'Z', 'é', 'ప', '్', 'ి', 'क', 'ा', 'ं', '‍']) assert.ok(isNameLetter(char, true), char);
  for (const char of ['1', '౩', '३', '।', '!', '@', '_']) assert.ok(!isNameLetter(char, true), char);
  assert.equal(checkPersonName('ప్రవీణ్ కుమార్', {}, true), null);
  assert.equal(checkPersonName('प्रवीण ३', {}, true), 'digits');
});

test('phone box keeps digits only, and a leading + for a country code', () => {
  assert.equal(typedPhone('98765 43210'), '9876543210');
  assert.equal(typedPhone('98765-abc-43210'), '9876543210');
  assert.equal(typedPhone('+91 98765 43210'), '+919876543210');
  assert.equal(typedPhone('9+1'), '91');
  assert.equal(typedPhone('౯౮౭౬౫౪౩౨౧౦'), '9876543210'); // Telugu digits
  assert.equal(typedPhone('९८७६५४३२१०'), '9876543210'); // Hindi digits
  assert.equal(typedPhone('1234567890123456789'), '123456789012345');
  // What the box keeps is still read with the country rules.
  assert.equal(toE164(typedPhone('98765 43210'), 'IN'), '+919876543210');
  assert.equal(toE164(typedPhone('+44 7911 123456'), 'IN'), '+447911123456');
  assert.equal(toE164(typedPhone('12345'), 'IN'), null);
});

test('email check', () => {
  for (const ok of ['name@gmail.com', ' name@gmail.com ', 'first.last+class@mail.co.in', 'a_b@x-y.org']) assert.ok(isValidEmail(ok), ok);
  for (const bad of ['name', 'name@gmail', 'name@gmail.c', 'na me@gmail.com', 'name@@gmail.com', '.name@gmail.com',
    'na..me@gmail.com', 'name.@gmail.com', 'name@-gmail.com', 'name@gmail..com', 'a,b@gmail.com', 'name@gmail.123']) {
    assert.ok(!isValidEmail(bad), bad);
  }
});

test('date of birth calendar: today at most, 100 years back at least, opens 18 years back', () => {
  assert.deepEqual(pickerRange(18, '2026-10-12'), {
    min: { year: 1926, month: 10, day: 12 },
    max: { year: 2026, month: 10, day: 12 },
    start: { year: 2008, month: 10, day: 12 },
  });
  // 29 February opens on 28 February in a year without it.
  assert.deepEqual(pickerRange(18, '2028-02-29').start, { year: 2010, month: 2, day: 28 });
  // The calendar's ends pass the sign-up's own check.
  const range = pickerRange(18, '2026-10-12');
  assert.equal(birthCheck(range.min, '2026-10-12'), 'adult');
  assert.equal(birthCheck(range.max, '2026-10-12'), 'minor');
  assert.equal(birthCheck(range.start, '2026-10-12'), 'adult');
});

test('date of birth as the typed text Register a student keeps', () => {
  assert.equal(typedOfParts({ day: 15, month: 6, year: 2012 }), '15-6-2012');
  assert.equal(typedOfParts({ day: null, month: 6, year: 2012 }), '-6-2012');
  assert.equal(typedOfParts({ day: null, month: null, year: null }), '');
  assert.deepEqual(partsOfTyped('15-06-2012'), { day: 15, month: 6, year: 2012 });
  assert.deepEqual(partsOfTyped('2012-06-15'), { day: 15, month: 6, year: 2012 });
  assert.deepEqual(partsOfTyped('-6-2012'), { day: null, month: 6, year: 2012 });
  assert.deepEqual(partsOfTyped(''), { day: null, month: null, year: null });
  for (const parts of [{ day: 15, month: 6, year: 2012 }, { day: 3, month: null, year: null }]) {
    assert.deepEqual(partsOfTyped(typedOfParts(parts)), parts);
  }
});

test('every person-name box uses the name rules', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  assert.match(read('app/sign-up.tsx'), /nameError\(name\)/);
  // The Diksha name moved from the sign-up to About you (#514), checked there by data/about.ts below.
  assert.doesNotMatch(read('app/sign-up.tsx'), /setDiksha|dikshaName/);
  assert.match(read('data/about.ts'), /nameError\(form\.dikshaName/);
  assert.match(read('data/about.ts'), /nameError\(form\.emergencyName/);
  assert.match(read('data/my-profile.ts'), /checkPersonName\(name/);
  assert.match(read('app/join-ishtagoshti.tsx'), /checkPersonName\(parentName\)/);
  assert.match(read('data/students.ts'), /nameError\(form\.fullName/);
  assert.match(read('data/students.ts'), /nameError\(form\.guardianName/);
  // The Excel import's preview (Guru) refuses the same names.
  assert.match(read('data/student-import.ts'), /checkPersonName\(fullName, \{ max: 100 \}\)/);
  // Accept (0046) only for a sign-up whose name passes; others go through the form (the rule is in
  // lib/waiting-list.ts since #291).
  assert.match(read('lib/waiting-list.ts'), /checkPersonName\(person\.full_name, \{ max: 100 \}\) !== null\) return 'name'/);
  assert.match(read('app/staff/register.tsx'), /canAccept = action === 'accept'/);
});

test('sign-up: the privacy notice tick is required and its version goes with the sign-up (audit S4-02)', () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const signUp = read('app/sign-up.tsx');
  assert.match(signUp, /if \(!noticeRead\) errors\.notice = 'signUp\.noticeRequired'/);
  assert.match(signUp, /noticeVersion: PRIVACY_NOTICE_VERSION/);
  // The link sits with the tick, before the Create button.
  assert.ok(signUp.indexOf("<PrivacyNoticeLink label={t('signUp.privacyNotice')} />") < signUp.indexOf("label={t('signUp.submit')}"));
  assert.match(read('auth/auth-actions.ts'), /notice_version: details\.noticeVersion/);
});

test('Join Ishtagoshti stays hidden for waiting logins while the terms are placeholders (audit S4-08)', async () => {
  const { IG_JOIN_FOR_WAITING } = await import('../src/lib/ishtagoshti-terms.ts');
  const placeholder = ['en', 'te', 'hi'].some((lang) => {
    const ig = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8')).ishtagoshtiJoin;
    return [ig.termsBody, ig.parentTerms].some((text) => /^\s*TEST\b/.test(text));
  });
  assert.ok(!(IG_JOIN_FOR_WAITING && placeholder), 'IG_JOIN_FOR_WAITING is on while a language still has the TEST terms');
  const pending = readFileSync(new URL('../src/app/pending.tsx', import.meta.url), 'utf8');
  assert.match(pending, /IG_JOIN_FOR_WAITING && profile\.ig_state === 'none'/);
});
