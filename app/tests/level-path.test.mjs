// Unit tests for the level path and the small celebrations (audit 22-10-2026 fix 12, docs/DECISIONS.md #620-#623):
// "7 of 20 in Beginner" (retired items left out, the next items in teaching order, the next level), which events are
// celebrated and only once, and the screens' wiring. Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { levelPath, nextLevelOf, NEXT_COUNT } = await import('../src/lib/level-path.ts');
const { celebrationEvents, dueCelebrations, takeDueCelebrations, knownCelebrations, CELEBRATE_WITHIN_DAYS } = await import(
  '../src/lib/celebrations.ts'
);
const { milestones } = await import('../src/lib/milestones.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));
const LEVELS = [1, 2, 3];

const item = (id, levelId, sort, doneOn = null, retired = false) => ({ id, levelId, sort, title: `Item ${id}`, doneOn, retired });

// ---------------------------------------------------------------- the level path (#620)

test('7 of 20 in Beginner: ticked items in use of the level, out of the level items in use', () => {
  const items = [];
  for (let n = 1; n <= 20; n += 1) items.push(item(n, 1, n, n <= 7 ? '2026-10-01' : null));
  items.push(item(21, 2, 1, '2026-10-02')); // another level does not count
  const path = levelPath(items, 1, LEVELS);
  assert.equal(path.done, 7);
  assert.equal(path.total, 20);
  assert.equal(path.complete, false);
  assert.equal(path.nextLevelId, 2);
});

test('retired items neither count nor come next; a ticked retired item stays out of the count', () => {
  const items = [item(1, 1, 1, '2026-10-01'), item(2, 1, 2, '2026-10-01', true), item(3, 1, 3, null, true), item(4, 1, 4)];
  const path = levelPath(items, 1, LEVELS);
  assert.deepEqual([path.done, path.total], [1, 2]);
  assert.deepEqual(path.next.map((i) => i.id), [4]);
});

test('the next items are the first untouched ones in teaching order, at most two', () => {
  assert.equal(NEXT_COUNT, 2);
  // Given out of order, with a gap in sort (an item retired and left out of the list).
  const items = [item(5, 1, 9), item(1, 1, 1, '2026-10-01'), item(3, 1, 4), item(2, 1, 2), item(4, 1, 7, '2026-10-03')];
  assert.deepEqual(levelPath(items, 1, LEVELS).next.map((i) => i.id), [2, 3]);
});

test('every item ticked: complete, nothing next; an empty level is not complete', () => {
  const full = levelPath([item(1, 3, 1, '2026-10-01'), item(2, 3, 2, '2026-10-02')], 3, LEVELS);
  assert.equal(full.complete, true);
  assert.deepEqual(full.next, []);
  assert.equal(full.nextLevelId, null);
  const empty = levelPath([], 2, LEVELS);
  assert.deepEqual([empty.done, empty.total, empty.complete], [0, 0, false]);
});

test('the level after: the next in order, none after the last or for an unknown level', () => {
  assert.equal(nextLevelOf(1, LEVELS), 2);
  assert.equal(nextLevelOf(2, LEVELS), 3);
  assert.equal(nextLevelOf(3, LEVELS), null);
  assert.equal(nextLevelOf(9, LEVELS), null);
});

// ---------------------------------------------------------------- the celebrations (#621-#623)

const practiceOn = (...days) => days.map((on) => ({ on, minutes: 20 }));
const GOAL = { days: 4, minutes: 15 };

test('events: each ticked item in use, each milestone reached, each move up (not the first placement, not down)', () => {
  const items = [item(1, 1, 1, '2026-10-20'), item(2, 1, 2), item(3, 1, 3, '2026-10-21', true)];
  const changes = [
    { id: 10, fromLevel: null, toLevel: 1, changedOn: '2026-01-05' },
    { id: 11, fromLevel: 1, toLevel: 2, changedOn: '2026-10-22' },
    { id: 12, fromLevel: 2, toLevel: 1, changedOn: '2026-10-23' },
  ];
  const reached = milestones(practiceOn('2026-10-19'), GOAL, '2026-10-24');
  const keys = celebrationEvents(items, changes, reached, LEVELS).map((e) => e.key);
  assert.deepEqual(keys.sort(), ['level:11', 'milestone:first', 'tick:1']);
});

test('the first time on a phone only the last 7 days count; afterwards every unknown key, whatever its date', () => {
  assert.equal(CELEBRATE_WITHIN_DAYS, 7);
  const events = celebrationEvents(
    [item(1, 1, 1, '2026-09-01'), item(2, 1, 2, '2026-10-17'), item(3, 1, 3, '2026-10-24')],
    [],
    [],
    LEVELS,
  );
  const first = dueCelebrations(events, null, '2026-10-24');
  assert.deepEqual(first.due.map((e) => e.key), ['tick:3', 'tick:2']);
  assert.deepEqual(first.keep.sort(), ['tick:1', 'tick:2', 'tick:3']);
  // Seen once, never again; a tick dated long ago but new to this phone is celebrated.
  const later = celebrationEvents([item(1, 1, 1, '2026-09-01'), item(4, 1, 4, '2026-08-01')], [], [], LEVELS);
  assert.deepEqual(dueCelebrations(later, first.keep, '2026-10-30').due.map((e) => e.key), ['tick:4']);
  assert.deepEqual(dueCelebrations(events, first.keep, '2026-10-30').due, []);
});

test('an item unticked and ticked again is not celebrated twice (keys are kept for good)', () => {
  const ticked = celebrationEvents([item(1, 1, 1, '2026-10-20')], [], [], LEVELS);
  const { keep } = dueCelebrations(ticked, [], '2026-10-20');
  const unticked = dueCelebrations(celebrationEvents([item(1, 1, 1)], [], [], LEVELS), keep, '2026-10-21');
  assert.deepEqual(unticked.keep, ['tick:1']);
  const again = dueCelebrations(celebrationEvents([item(1, 1, 1, '2026-10-22')], [], [], LEVELS), unticked.keep, '2026-10-22');
  assert.deepEqual(again.due, []);
});

test('a level first, then milestones, then ticks; newest first in each', () => {
  const events = celebrationEvents(
    [item(1, 1, 1, '2026-10-20'), item(2, 1, 2, '2026-10-22')],
    [{ id: 7, fromLevel: 1, toLevel: 2, changedOn: '2026-10-19' }],
    milestones(practiceOn('2026-10-21'), GOAL, '2026-10-24'),
    LEVELS,
  );
  assert.deepEqual(dueCelebrations(events, [], '2026-10-24').due.map((e) => e.key), ['level:7', 'milestone:first', 'tick:2', 'tick:1']);
});

test('the events count as shown once taken, per login on this phone', () => {
  const events = celebrationEvents([item(1, 1, 1, '2026-10-24')], [], [], LEVELS);
  assert.equal(knownCelebrations('login-a'), null);
  assert.deepEqual(takeDueCelebrations('login-a', events, '2026-10-24').map((e) => e.key), ['tick:1']);
  assert.deepEqual(knownCelebrations('login-a'), ['tick:1']);
  assert.deepEqual(takeDueCelebrations('login-a', events, '2026-10-24'), []);
  // Another login on the same phone has its own.
  assert.deepEqual(takeDueCelebrations('login-b', events, '2026-10-24').map((e) => e.key), ['tick:1']);
});

// ---------------------------------------------------------------- wiring, texts, accessibility

test('the home strip and My progress show the path; the home reads it after the numbers, not on every focus', () => {
  const home = src('app/student/(tabs)/index.tsx');
  assert.ok(home.includes('fetchMyPath(myId)'));
  assert.ok(home.includes('PATH_EVERY_MS'));
  assert.ok(home.includes("t('levelPath.next'"));
  assert.ok(home.includes('takeDueCelebrations(myId, events, today)'));
  assert.ok(home.includes('<CelebrationCard'));
  // Only with every part read, and never over the welcome.
  assert.ok(home.includes('loadedPath.levelChanges === null || loadedPath.practice === null'));
  assert.ok(home.includes('welcomeDue(welcomeSeen(myId)'));
  assert.ok(src('app/student/progress.tsx').includes('<LevelPathView path={levelPath(loaded.items, loaded.levelId, LEVEL_IDS)} />'));
});

test('no new database function: the path reads tables a student already reads', () => {
  const data = src('data/level-path.ts');
  assert.doesNotMatch(data, /\.rpc\(/);
  for (const table of ['students', 'syllabus_items', 'student_progress', 'level_history']) assert.ok(data.includes(`from('${table}')`), table);
  assert.ok(data.includes('fetchPracticeHistory(studentId)'));
});

test('the celebration is calm: reduce motion respected, the text announced, no confetti or points', () => {
  const card = src('components/celebration-card.tsx');
  assert.ok(card.includes('isReduceMotionEnabled()'));
  assert.ok(card.includes('if (reduce) shown.setValue(1)'));
  assert.ok(card.includes('announce(message)'));
  assert.ok(card.includes('role="status"'));
  assert.doesNotMatch(card, /Animated\.loop|confetti/i);
  for (const lang of ['en', 'te', 'hi']) {
    const text = JSON.stringify(locale(lang).celebrate);
    assert.doesNotMatch(text, /points|XP|leaderboard|confetti/i, lang);
  }
});

test('every new text is there in English, Telugu and Hindi, with the count wording of the path', () => {
  for (const lang of ['en', 'te', 'hi']) {
    const l = locale(lang);
    for (const key of ['label', 'next', 'nextTitle', 'complete', 'nextLevel', 'topLevel']) assert.ok(l.levelPath[key], `${lang} levelPath.${key}`);
    for (const key of ['title', 'level', 'milestone', 'tick', 'more_one', 'more_other', 'blessing', 'continue']) {
      assert.ok(l.celebrate[key], `${lang} celebrate.${key}`);
    }
    for (const p of ['{{done}}', '{{total}}', '{{level}}']) assert.ok(l.home.student.levelStrip.includes(p), `${lang} levelStrip ${p}`);
  }
  assert.equal(locale('en').home.student.levelStrip, '{{done}} of {{total}} in {{level}}');
});
