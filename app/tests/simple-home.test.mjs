// Unit tests for the simple homes (docs/DECISIONS.md #240-#243): the count on a circle and what a
// screen reader hears for it, the fact of the day, and the new texts in all three languages.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { badgeText, moduleSpokenName } = await import('../src/lib/module-badge.ts');
const { factNumber, FACT_COUNT } = await import('../src/lib/fact-of-the-day.ts');

const locale = (lang) => JSON.parse(readFileSync(new URL(`../src/i18n/locales/${lang}.json`, import.meta.url), 'utf8'));

test('a badge shows 1-9, then 9+, and nothing for 0 or no count', () => {
  assert.equal(badgeText(undefined), null);
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(-2), null);
  assert.equal(badgeText(1), '1');
  assert.equal(badgeText(9), '9');
  assert.equal(badgeText(10), '9+');
  assert.equal(badgeText(250), '9+');
});

test('a circle is read with its count in words, only when there is a count', () => {
  assert.equal(moduleSpokenName('Announcements', { count: 3, badgeSpoken: '3 new' }), 'Announcements, 3 new');
  assert.equal(moduleSpokenName('Announcements', { count: 0, badgeSpoken: '0 new' }), 'Announcements');
  assert.equal(moduleSpokenName('Instruments', { soon: 'Coming soon' }), 'Instruments, Coming soon');
  // The full count is said even when the badge shows 9+.
  assert.equal(moduleSpokenName('Follow-up calls', { count: 12, badgeSpoken: '12 due' }), 'Follow-up calls, 12 due');
});

test('the fact of the day is one of the facts, the same all day, the next one tomorrow', () => {
  const morning = new Date(2026, 9, 10, 6, 0);
  const night = new Date(2026, 9, 10, 23, 30);
  const tomorrow = new Date(2026, 9, 11, 6, 0);
  assert.equal(factNumber(morning), factNumber(night));
  assert.equal(factNumber(tomorrow), (factNumber(morning) % FACT_COUNT) + 1);
  for (let day = 0; day < 40; day += 1) {
    const n = factNumber(new Date(2026, 0, 1 + day));
    assert.ok(n >= 1 && n <= FACT_COUNT, String(n));
  }
});

test('every fact and every new home text is there in English, Telugu and Hindi', () => {
  for (const lang of ['en', 'te', 'hi']) {
    const l = locale(lang);
    assert.ok(l.facts.title, `${lang} facts.title`);
    for (let n = 1; n <= FACT_COUNT; n += 1) assert.ok(l.facts[`f${n}`], `${lang} facts.f${n}`);
    assert.equal(l.facts[`f${FACT_COUNT + 1}`], undefined, `${lang}: FACT_COUNT matches the locale`);
    for (const key of ['new', 'toVote', 'notFinished', 'due', 'waiting']) assert.ok(l.home.badges[key], `${lang} home.badges.${key}`);
    for (const key of ['overview', 'newJoiners', 'promotions']) assert.ok(l.home.modules[key], `${lang} home.modules.${key}`);
    for (const key of ['levelStrip', 'levelStripNone']) assert.ok(l.home.student[key], `${lang} home.student.${key}`);
    assert.ok(l.home.guru.openCalls, `${lang} home.guru.openCalls`);
  }
});

test('the counts in the badge texts use {{count}}', () => {
  for (const lang of ['en', 'te', 'hi']) {
    const b = locale(lang).home.badges;
    for (const key of ['new', 'toVote', 'due', 'waiting']) assert.match(b[key], /\{\{count\}\}/, `${lang} ${key}`);
  }
});
