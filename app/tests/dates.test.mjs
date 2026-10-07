// Unit tests for src/lib/dates.ts: "today" is always today in India (IST), whatever the computer's
// time zone, and the day-month-year reading and age rules the registration form relies on
// (audit D14-15). Run from app/: npm test (Node's own test runner, which reads the .ts file directly).

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  ageOn,
  dateInIndia,
  formatDateTimeInIndia,
  formatDayMonthYear,
  isMinorOn,
  momentInIndia,
  parseDayMonthYear,
  parseTimeOfDay,
  startOfTodayInIndia,
  timeInIndia,
  todayInIndia,
} from '../src/lib/dates.ts';

test('today in India rolls over at midnight IST, not UTC', (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 6, 18, 29) }); // 23:59 IST on 6 Oct
  assert.equal(todayInIndia(), '2026-10-06');
  mock.timers.setTime(Date.UTC(2026, 9, 6, 18, 30)); // 00:00 IST on 7 Oct, still 6 Oct in UTC
  assert.equal(todayInIndia(), '2026-10-07');
  assert.equal(startOfTodayInIndia(), '2026-10-07T00:00:00+05:30');
});

test('a database timestamp is read as its date and time in India', () => {
  assert.equal(dateInIndia('2026-10-06T19:00:00Z'), '2026-10-07');
  assert.equal(timeInIndia('2026-10-06T19:00:00Z'), '00:30');
  assert.equal(timeInIndia('2026-09-30T10:35:00+00:00'), '16:05');
  assert.equal(formatDateTimeInIndia('2026-09-30T10:35:00Z'), '30-09-2026 16:05');
});

test('dates are written day-month-year', () => {
  assert.equal(formatDayMonthYear('2026-09-29'), '29-09-2026');
});

test('a typed day-month-year is read with -, / or . and must be a real date', () => {
  assert.equal(parseDayMonthYear('15-06-2012'), '2012-06-15');
  assert.equal(parseDayMonthYear(' 5/6/2012 '), '2012-06-05');
  assert.equal(parseDayMonthYear('15.06.2012'), '2012-06-15');
  assert.equal(parseDayMonthYear('29-02-2024'), '2024-02-29');
  assert.equal(parseDayMonthYear('29-02-2023'), null, 'no 29 February in 2023');
  assert.equal(parseDayMonthYear('31-04-2026'), null, 'April has 30 days');
  assert.equal(parseDayMonthYear('2012-06-15'), null, 'ISO order is not day-month-year');
  assert.equal(parseDayMonthYear('15-06-12'), null, 'the year needs four digits');
  assert.equal(parseDayMonthYear(''), null);
});

test('a typed time of day is 24-hour and real', () => {
  assert.equal(parseTimeOfDay('18:30'), '18:30');
  assert.equal(parseTimeOfDay('9:05'), '09:05');
  assert.equal(parseTimeOfDay('18.30'), '18:30');
  assert.equal(parseTimeOfDay('24:00'), null);
  assert.equal(parseTimeOfDay('12:60'), null);
  assert.equal(parseTimeOfDay('6pm'), null);
  assert.equal(momentInIndia('2026-10-04', '18:30'), '2026-10-04T18:30:00+05:30');
});

test('age counts full years; the 18th birthday ends being a minor (DECISIONS #8)', () => {
  assert.equal(ageOn('2008-10-07', '2026-10-06'), 17);
  assert.equal(ageOn('2008-10-07', '2026-10-07'), 18);
  assert.equal(isMinorOn('2008-10-07', '2026-10-06'), true, 'the day before the 18th birthday');
  assert.equal(isMinorOn('2008-10-07', '2026-10-07'), false, 'on the 18th birthday');
  assert.equal(isMinorOn('2008-12-31', '2026-01-01'), true, 'across the new year');
  // Born on 29 February: the birthday counts from 1 March in other years, as in Postgres age().
  assert.equal(isMinorOn('2008-02-29', '2026-02-28'), true);
  assert.equal(isMinorOn('2008-02-29', '2026-03-01'), false);
});
