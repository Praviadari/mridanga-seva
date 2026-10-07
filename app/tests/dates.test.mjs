// Unit tests for src/lib/dates.ts: "today" and the time of day are the class's (its centre's time
// zone, India until known), whatever the computer's own zone; the day-month-year reading and the
// age rule the registration form relies on (audit D14-15, docs/DECISIONS.md #132, #134).
// Run from app/: npm test. The class's zone and the app's language come from stand-ins
// (tests/stubs/class-locale.mjs, i18n.mjs).

import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import './stubs/register.mjs';

const {
  ageOn,
  formatDate,
  formatDateTime,
  formatTypedDate,
  isMinorOn,
  localDate,
  localMoment,
  localTime,
  parseDayMonthYear,
  parseTimeOfDay,
  startOfTodayLocal,
  todayLocal,
  zoneOffsetMinutes,
} = await import('../src/lib/dates.ts');

const INDIA = { timeZone: 'Asia/Kolkata', country: 'IN' };
const NEW_YORK = { timeZone: 'America/New_York', country: 'US' };

afterEach(() => {
  mock.timers.reset();
  globalThis.__testClassLocale = undefined;
  globalThis.__testLanguage = undefined;
});

test('India: today rolls over at midnight IST, not UTC', () => {
  globalThis.__testClassLocale = INDIA;
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 6, 18, 29) }); // 23:59 IST on 6 Oct
  assert.equal(todayLocal(), '2026-10-06');
  mock.timers.setTime(Date.UTC(2026, 9, 6, 18, 30)); // 00:00 IST on 7 Oct, still 6 Oct in UTC
  assert.equal(todayLocal(), '2026-10-07');
  assert.equal(startOfTodayLocal(), '2026-10-07T00:00:00+05:30');
});

test('New York: the class counts its own days, while India is already in the next one', () => {
  globalThis.__testClassLocale = NEW_YORK;
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 7, 3, 59) }); // 23:59 on 6 Oct in New York
  assert.equal(todayLocal(), '2026-10-06');
  mock.timers.setTime(Date.UTC(2026, 9, 7, 4, 0));
  assert.equal(todayLocal(), '2026-10-07');
});

test('a database timestamp is read as the date and time at the class', () => {
  assert.equal(localDate('2026-10-06T19:00:00Z'), '2026-10-07', 'India until the class is known');
  assert.equal(localTime('2026-10-06T19:00:00Z'), '00:30');
  assert.equal(formatDateTime('2026-09-30T10:35:00Z'), '30-09-2026 16:05');
  globalThis.__testClassLocale = NEW_YORK;
  assert.equal(localDate('2026-10-06T19:00:00Z'), '2026-10-06');
  assert.equal(localTime('2026-10-06T19:00:00Z'), '15:00');
});

test('a day and a time become a timestamp with the offset in force then (summer time abroad)', () => {
  assert.equal(localMoment('2026-10-04', '18:30'), '2026-10-04T18:30:00+05:30');
  globalThis.__testClassLocale = NEW_YORK;
  assert.equal(localMoment('2026-10-04', '18:30'), '2026-10-04T18:30:00-04:00');
  assert.equal(localMoment('2026-12-04', '18:30'), '2026-12-04T18:30:00-05:00');
  assert.equal(zoneOffsetMinutes(Date.UTC(2026, 0, 1), 'Mars/Olympus_Mons'), 330, 'an unknown zone falls back to India');
});

test('India keeps day-month-year; elsewhere the month is a word (DECISIONS #134)', () => {
  assert.equal(formatDate('2026-09-29'), '29-09-2026');
  globalThis.__testClassLocale = NEW_YORK;
  assert.equal(formatDate('2026-09-29'), 'Sep 29, 2026');
  assert.equal(formatTypedDate('2026-10-04'), '04-10-2026', 'form fields stay day-month-year everywhere');
});

test('a typed date is day-month-year (-, / or .) or ISO, and must be a real date', () => {
  assert.equal(parseDayMonthYear('15-06-2012'), '2012-06-15');
  assert.equal(parseDayMonthYear(' 5/6/2012 '), '2012-06-05');
  assert.equal(parseDayMonthYear('15.06.2012'), '2012-06-15');
  assert.equal(parseDayMonthYear('2012-06-15'), '2012-06-15', 'ISO 8601 is read too');
  assert.equal(parseDayMonthYear('29-02-2024'), '2024-02-29');
  assert.equal(parseDayMonthYear('29-02-2023'), null, 'no 29 February in 2023');
  assert.equal(parseDayMonthYear('31-04-2026'), null, 'April has 30 days');
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
