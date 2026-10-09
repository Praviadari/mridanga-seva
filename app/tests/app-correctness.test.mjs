// Unit tests for the app correctness backlog (audit 01-10-2026, dimension 6; docs/DECISIONS.md
// #178-#185): the network wording of every browser (D6-05), the ids a screen's address may hold
// (D6-07), the name search of C5 (FS2-04), date arithmetic for the date caps (D6-14) and a
// malformed link that opened the app (D6-16). Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const { isNetworkError } = await import('../src/data/errors.ts');
const { isRouteId } = await import('../src/lib/route-id.ts');
const { cleanSearchText, studentSearchFilter } = await import('../src/lib/student-search.ts');
const { addDays } = await import('../src/lib/dates.ts');

test('D6-05: a failed request is a network error in Chrome, Safari, Firefox and on phones', () => {
  for (const message of [
    'TypeError: Failed to fetch',
    'TypeError: Load failed',
    'TypeError: NetworkError when attempting to fetch resource.',
    'TypeError: Network request failed',
  ]) {
    assert.equal(isNetworkError(message), true, message);
  }
  assert.equal(isNetworkError('new row violates row-level security policy'), false);
  assert.equal(isNetworkError('student_not_found'), false);
});

test('D6-07: only real ids reach the database', () => {
  assert.equal(isRouteId('12', 'number'), true);
  for (const bad of ['NaN', 'abc', '0', '-3', '1.5', '12abc', ' 12', '99999999999999999999', '', undefined]) {
    assert.equal(isRouteId(bad, 'number'), false, String(bad));
  }
  assert.equal(isRouteId('new', 'number'), false, '"new" only where a screen offers an empty form');
  assert.equal(isRouteId('new', 'number', true), true);
  assert.equal(isRouteId('3f1c2a4b-9d8e-4f00-8a11-0123456789ab', 'uuid'), true);
  assert.equal(isRouteId('3F1C2A4B-9D8E-4F00-8A11-0123456789AB', 'uuid'), true);
  assert.equal(isRouteId('abc', 'uuid'), false);
  assert.equal(isRouteId('12', 'uuid'), false);
});

test("FS2-04: 'K. Sri' searches the words K and Sri, so 'K. Srinivas' is found", () => {
  assert.equal(cleanSearchText('K. Sri'), 'K Sri');
  assert.equal(
    studentSearchFilter(cleanSearchText('K. Sri')),
    'and(full_name.ilike.*K*,full_name.ilike.*Sri*),roll_no.ilike.*K Sri*',
  );
  assert.equal(studentSearchFilter('Radha'), 'full_name.ilike.*Radha*,roll_no.ilike.*Radha*');
  // Nothing that PostgREST reads as syntax survives: commas, brackets, dots, stars.
  assert.equal(cleanSearchText('a,b(c).d*e'), 'a b c d e');
  assert.equal(cleanSearchText('శ్రీనివాస్'), 'శ్రీనివాస్', 'Telugu vowel signs stay');
});

test('D6-14: addDays counts calendar days across months, years and leap days', () => {
  assert.equal(addDays('2026-10-09', 365), '2027-10-09');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('D6-16: a malformed link that opened the app goes to the home screen, not an error', async () => {
  globalThis.__testOS = 'android';
  globalThis.__testInitialUrl = 'https://[not-a-host/student/announcements/12';
  globalThis.window = undefined;
  const { requestedPathFor } = await import(`../src/auth/requested-path.ts?start=${Math.random()}`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requestedPathFor('student'), null);
});
