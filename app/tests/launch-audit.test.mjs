// Unit tests for the launch audit's fixes (15-10-2026, docs/DECISIONS.md #390-#409). Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------- #390 possible duplicates at the desk

const { duplicateKey, duplicateQuery, duplicatesFrom } = await import('../src/lib/duplicates.ts');

test('possible_duplicates rows become a list without the sign-up the desk works from', () => {
  const rows = [
    { kind: 'student', id: 's1', roll_no: 'MS-2026-0016', full_name: 'Ravi Kumar', centre: 'Abids', since: '2026-10-15',
      withdrawn: false, matched: ['name_dob'] },
    { kind: 'sign_up', id: 'p1', roll_no: null, full_name: 'Ravi Kumar', centre: 'Abids', since: '2026-10-14', withdrawn: false,
      matched: ['name_dob', 'phone'] },
    { kind: 'sign_up', id: 'p2', roll_no: null, full_name: 'Ravi K', centre: null, since: null, withdrawn: false, matched: ['phone'] },
    { kind: 'other', id: 'x', full_name: 'Nobody' },
    null,
  ];
  const list = duplicatesFrom(rows, 'p1');
  assert.deepEqual(list.map((d) => d.id), ['s1', 'p2']);
  assert.deepEqual(
    { ...list[0] },
    { kind: 'student', id: 's1', rollNo: 'MS-2026-0016', fullName: 'Ravi Kumar', centre: 'Abids', since: '2026-10-15',
      withdrawn: false, sameNameAndBirth: true, samePhone: false },
  );
  assert.equal(list[1].samePhone, true);
  assert.deepEqual(duplicatesFrom(null), []);
  assert.deepEqual(duplicatesFrom({ not: 'a list' }), []);
});

test('the desk asks only with a name and birth date, or a phone of 7 or more digits', () => {
  assert.equal(duplicateQuery('Ravi', null, null), null);
  assert.equal(duplicateQuery('', '1990-05-01', '12345'), null);
  assert.deepEqual(duplicateQuery(' Ravi Kumar ', '1990-05-01', ''), { p_full_name: 'Ravi Kumar', p_dob: '1990-05-01', p_phone: null });
  assert.deepEqual(duplicateQuery('Ravi', null, '98765 43210'), { p_full_name: 'Ravi', p_dob: null, p_phone: '98765 43210' });
  // The key ignores case and the phone's spaces, so the list stays for the same person and goes for another.
  assert.equal(
    duplicateKey(duplicateQuery('Ravi Kumar', '1990-05-01', '98765 43210')),
    duplicateKey(duplicateQuery('ravi kumar', '1990-05-01', '9876543210')),
  );
  assert.notEqual(
    duplicateKey(duplicateQuery('Ravi Kumar', '1990-05-01', null)),
    duplicateKey(duplicateQuery('Ravi Kumar', '1990-05-02', null)),
  );
});

test('Register a student asks possible_duplicates at Next and on Accept, and shows the answer', () => {
  const data = src('data/students.ts');
  assert.match(data, /rpc\('possible_duplicates', query\)/);
  const screen = src('app/staff/register.tsx');
  const next = screen.slice(screen.indexOf('function next()'), screen.indexOf('async function save()'));
  assert.match(next, /fetchPossibleDuplicates\(form\.fullName, dob, form\.phone, fromSignUp\?\.id \?\? null\)/);
  const ask = screen.slice(screen.indexOf('function askAccept('), screen.indexOf('async function confirmAccept('));
  assert.match(ask, /fetchPossibleDuplicates\(person\.full_name, person\.dob, person\.phone \?\? null, person\.id\)/);
  assert.match(screen, /<PossibleDuplicates\s+place="save"/);
  assert.match(screen, /<PossibleDuplicates place="accept"/);
});

test('a form filled from a sign-up that did not connect the login says the sign-up still waits (#392)', () => {
  const screen = src('app/staff/register.tsx');
  assert.match(screen, /fromSignUp: !!fromSignUp/);
  assert.match(screen, /saved\.fromSignUp && !saved\.registered\.linked/);
  for (const lang of ['en', 'te', 'hi']) {
    const json = JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));
    assert.match(json.register.signUpNotLinked, /\{\{name\}\}/, lang);
  }
});

// ---------------------------------------------------------------- #391 My QR asks again on focus

test('My QR loads the card each time it comes into view, not once per mount', () => {
  const screen = src('app/student/(tabs)/my-qr.tsx');
  const focus = screen.indexOf('useFocusEffect(');
  assert.ok(focus >= 0 && screen.indexOf('fetchMyCard(profileId)', focus) > focus, 'fetchMyCard inside useFocusEffect');
  assert.doesNotMatch(screen, /useEffect\(\(\) => \{\s*if \(!profileId\)/);
});
