// Unit tests for the account-creation helpers (migration 0036, docs/DECISIONS.md #162, #164): phone
// numbers in E.164 with libphonenumber-js's min metadata (src/lib/phone.ts) and the date of birth
// picked as day / month / year with its under-18 rule (src/lib/birth-date.ts).
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const { callingCode, formatPhone, isPhoneCountry, splitE164, toE164 } = await import('../src/lib/phone.ts');
const { birthCheck, birthDateOf, birthYears, partsOf } = await import('../src/lib/birth-date.ts');

test('an Indian mobile typed with spaces becomes E.164', () => {
  assert.equal(toE164('98765 43210', 'IN'), '+919876543210');
  assert.equal(toE164('+91 98765-43210', 'US'), '+919876543210', 'a typed + and country code win over the picker');
  assert.equal(callingCode('IN'), '+91');
});

test('numbers of other countries are kept in their own form', () => {
  // The min metadata checks lengths and leading digits per country, not every number range.
  assert.equal(toE164('(212) 555-0123', 'US'), '+12125550123');
  assert.equal(toE164('07911 123456', 'GB'), '+447911123456');
  assert.equal(toE164('9876543210', 'GB'), null, 'an Indian mobile is not a UK number');
});

test('nonsense and short numbers are refused', () => {
  assert.equal(toE164('12345', 'IN'), null);
  assert.equal(toE164('abc', 'IN'), null);
  assert.equal(toE164('   ', 'IN'), null);
});

test('a stored number splits back into country and national part, and reads well', () => {
  assert.deepEqual(splitE164('+919876543210'), { country: 'IN', national: '098765 43210' });
  assert.equal(splitE164(null), null);
  assert.equal(formatPhone('+919876543210'), '+91 98765 43210');
  assert.equal(formatPhone('not a phone'), 'not a phone');
  assert.equal(isPhoneCountry('IN'), true);
  assert.equal(isPhoneCountry('XX'), false);
});

test('the date of birth needs all three parts and a real day', () => {
  assert.equal(birthDateOf({ day: 5, month: 4, year: 1996 }), '1996-04-05');
  assert.equal(birthDateOf({ day: 31, month: 4, year: 1996 }), null, '31 April does not exist');
  assert.equal(birthDateOf({ day: 29, month: 2, year: 2024 }), '2024-02-29');
  assert.equal(birthDateOf({ day: null, month: 4, year: 1996 }), null);
  assert.deepEqual(partsOf('1996-04-05'), { day: 5, month: 4, year: 1996 });
});

test('under 18 goes to the desk; the day of the 18th birthday is an adult', () => {
  const today = '2026-10-07';
  assert.equal(birthCheck({ day: 7, month: 10, year: 2008 }, today), 'adult');
  assert.equal(birthCheck({ day: 8, month: 10, year: 2008 }, today), 'minor');
  assert.equal(birthCheck({ day: null, month: 10, year: 2008 }, today), 'missing');
  assert.equal(birthCheck({ day: 8, month: 10, year: 2026 }, today), 'invalid', 'tomorrow');
  assert.equal(birthCheck({ day: 31, month: 2, year: 2000 }, today), 'invalid');
});

test('the year list runs from this year back 100 years', () => {
  const years = birthYears('2026-10-07');
  assert.equal(years[0], 2026);
  assert.equal(years.at(-1), 1926);
  assert.equal(years.length, 101);
});
