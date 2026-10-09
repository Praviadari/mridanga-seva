// Unit tests for the a11y/i18n backlog's input fixes (audit D8-16, D8-17): digits typed with a
// Telugu or Hindi keyboard, and 12-hour times with am / pm. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const { asciiDigits } = await import('../src/lib/digits.ts');
const { parseDayMonthYear, parseTimeOfDay } = await import('../src/lib/dates.ts');

test('Devanagari, Telugu and full-width digits read as 0-9', () => {
  assert.equal(asciiDigits('१५-०६-२०१२'), '15-06-2012');
  assert.equal(asciiDigits('౧౫-౦౬-౨౦౧౨'), '15-06-2012');
  assert.equal(asciiDigits('９８７６５'), '98765');
  assert.equal(asciiDigits('+91 98765 43210'), '+91 98765 43210');
  assert.equal(asciiDigits('abc'), 'abc');
});

test('a date typed with Indic digits is read', () => {
  assert.equal(parseDayMonthYear('१५-०६-२०१२'), '2012-06-15');
  assert.equal(parseDayMonthYear('౧౫/౦౬/౨౦౧౨'), '2012-06-15');
  assert.equal(parseDayMonthYear('31-02-2012'), null);
});

test('24-hour times read as before', () => {
  assert.equal(parseTimeOfDay('18:30'), '18:30');
  assert.equal(parseTimeOfDay('9.05'), '09:05');
  assert.equal(parseTimeOfDay('6:30'), '06:30');
  assert.equal(parseTimeOfDay('24:00'), null);
  assert.equal(parseTimeOfDay('18:3'), null);
});

test('12-hour times with am / pm', () => {
  assert.equal(parseTimeOfDay('6:30 pm'), '18:30');
  assert.equal(parseTimeOfDay('6.30PM'), '18:30');
  assert.equal(parseTimeOfDay('6:30 p.m.'), '18:30');
  assert.equal(parseTimeOfDay('12:15 am'), '00:15');
  assert.equal(parseTimeOfDay('12:15 pm'), '12:15');
  assert.equal(parseTimeOfDay('11:59 AM'), '11:59');
  assert.equal(parseTimeOfDay('13:00 pm'), null);
  assert.equal(parseTimeOfDay('0:30 am'), null);
  assert.equal(parseTimeOfDay('౬:౩౦ pm'), '18:30');
});
