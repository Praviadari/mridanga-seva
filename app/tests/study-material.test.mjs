// Unit tests for study material as lessons and chapters (docs/DECISIONS.md #785-#789; the team's "Study Material
// Navigation" draft of 02-11-2026): a section = a lesson, its items = chapters, an item without a section = a lesson of
// one chapter; "n of m chapters done"; Previous / Next across lessons; the chapter's default tab; Continue learning on
// this device only (forgotten at sign-out); Practise now's games; marks on game cards only for Beginner exercises; the
// screens' wiring and the strings in en/te/hi.
// Run from app/: npm test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import './stubs/register.mjs';

const { studyLessons, chaptersDone, lessonOf, chapterSteps, defaultTab, tabParam, CHAPTER_TABS } = await import('../src/lib/study-lessons.ts');
const { lastChapter, saveLastChapter, forgetLastChapter } = await import('../src/lib/last-chapter.ts');
const { gamesForItem } = await import('../src/lib/playground-games/catalogue.ts');
const { exerciseMarks, keyMarks, MARKS_LEVEL } = await import('../src/lib/playground/marks.ts');

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const locale = (lang) => JSON.parse(src(`i18n/locales/${lang}.json`));

const CORE = 'Section 1: Core Practice';
const SEVA = 'Section 2: Temple Seva';
const item = (id, section, doneOn = null, retired = false) => ({ id, section, doneOn, retired, title: `Item ${id}` });

test('a section is a lesson with its items as chapters; an item without a section is a lesson of one chapter', () => {
  const lessons = studyLessons([item(1, null), item(2, CORE), item(3, CORE), item(4, SEVA), item(5, null)]);
  assert.deepEqual(
    lessons.map((l) => [l.section, l.single, l.chapters.map((c) => c.id)]),
    [
      [null, true, [1]],
      [CORE, false, [2, 3]],
      [SEVA, false, [4]],
      [null, true, [5]],
    ],
  );
  // A level with no sections (the Beginner syllabus today): one lesson per item, each opening its chapter at once.
  assert.ok(studyLessons([item(1, null), item(2, null)]).every((l) => l.single));
  // Keys stay apart when the Guru split a section by putting items out of order.
  const split = studyLessons([item(1, CORE), item(2, SEVA), item(3, CORE)]);
  assert.equal(new Set(split.map((l) => l.key)).size, 3);
  assert.equal(lessonOf(lessons, 3)?.section, CORE);
  assert.equal(lessonOf(lessons, 99), null);
});

test('"n of m chapters done" counts ticks among the chapters in use; a retired chapter does not count', () => {
  const [lesson] = studyLessons([item(1, CORE, '2026-10-01'), item(2, CORE), item(3, CORE, '2026-09-01', true)]);
  assert.deepEqual(chaptersDone(lesson), { done: 1, total: 2 });
});

test('Previous / Next walk teaching order; the last chapter of a lesson leads to the next lesson; the very last has none', () => {
  const lessons = studyLessons([item(1, CORE), item(2, CORE), item(3, SEVA), item(4, null)]);
  assert.deepEqual(
    [chapterSteps(lessons, 1).previous, chapterSteps(lessons, 1).next?.id, chapterSteps(lessons, 1).nextLesson],
    [null, 2, false],
  );
  assert.deepEqual([chapterSteps(lessons, 2).previous?.id, chapterSteps(lessons, 2).next?.id, chapterSteps(lessons, 2).nextLesson], [1, 3, true]);
  assert.deepEqual([chapterSteps(lessons, 3).next?.id, chapterSteps(lessons, 3).nextLesson], [4, true]);
  assert.deepEqual([chapterSteps(lessons, 4).previous?.id, chapterSteps(lessons, 4).next], [3, null]);
  assert.deepEqual(chapterSteps(lessons, 99), { previous: null, next: null, nextLesson: false });
});

test('the chapter opens on Video if it has one, else Audio, else Notes; the address may name a tab', () => {
  assert.deepEqual([...CHAPTER_TABS], ['video', 'audio', 'notes']);
  assert.equal(defaultTab({ videos: 1, audios: 1, notes: 1 }), 'video');
  assert.equal(defaultTab({ videos: 0, audios: 2, notes: 1 }), 'audio');
  assert.equal(defaultTab({ videos: 0, audios: 0, notes: 0 }), 'notes');
  assert.equal(tabParam('audio'), 'audio');
  assert.equal(tabParam('pdf'), null);
  assert.equal(tabParam(undefined), null);
});

test('Continue learning: the last chapter is kept for the person signed in only, and forgotten at sign-out', () => {
  forgetLastChapter();
  assert.equal(lastChapter('p1'), null);
  saveLastChapter({ profileId: 'p1', itemId: 7, title: 'Notations', lesson: CORE });
  assert.deepEqual(lastChapter('p1'), { profileId: 'p1', itemId: 7, title: 'Notations', lesson: CORE });
  assert.equal(lastChapter('p2'), null, 'another login on the same phone sees nothing');
  assert.equal(lastChapter(''), null);
  forgetLastChapter();
  assert.equal(lastChapter('p1'), null);
  assert.match(src('lib/device-traces.ts'), /forgetLastChapter\(\);/);
});

test('Practise now: the built games with an exercise tied to the item, in the home\'s order, each once', () => {
  const exercises = [
    { game: 'tempo_detective', requiresItem: 5 },
    { game: 'sound_detective', requiresItem: 5 },
    { game: 'sound_detective', requiresItem: 5 },
    { game: 'echo', requiresItem: 6 },
    { game: 'missing_beat', requiresItem: null },
  ];
  assert.deepEqual(gamesForItem(exercises, 5).map((g) => g.game), ['sound_detective', 'tempo_detective']);
  assert.deepEqual(gamesForItem(exercises, 9), []);
  const screen = src('screens/chapter.tsx');
  // A game serves an item's exercise only once the item is ticked; otherwise Practice tools.
  assert.match(screen, /const itemGames = item\.doneOn \? games : \[\];/);
  assert.match(screen, /router\.push\(area === 'me' \? '\/staff\/me\/practice' : '\/student\/practice'\)/);
  assert.match(screen, /playgroundOnForStudent\(playground\)/);
});

test('#789: game cards show the default marks for a Beginner exercise only', () => {
  assert.equal(MARKS_LEVEL, 1);
  assert.equal(exerciseMarks('te.re khe', 1), keyMarks('te.re khe'));
  assert.equal(exerciseMarks('te.re khe', 2), null, 'an Intermediate exercise: bol and hand only');
  assert.equal(exerciseMarks('te', undefined), null);
});

test('the chapter screen: tabs always, coming soon, no autoplay, one medium at a time, practice in place, steps', () => {
  const screen = src('screens/chapter.tsx');
  assert.match(screen, /choices=\{CHAPTER_TABS\.map/);
  assert.match(screen, /videos\.length === 0 \? comingSoon : null/);
  assert.match(screen, /audios\.length === 0 \? comingSoon : null/);
  assert.match(screen, /notesCount === 0 \? comingSoon : null/);
  // One medium at a time: each plays only while it is the owner (or nothing started), recording takes over.
  assert.match(screen, /const mayPlay = \(key: string, which: ChapterTab\) => current === which && \(owner === null \|\| owner === key\);/);
  assert.match(screen, /onRecordStart=\{\(\) => setOwner\('record'\)\}/);
  assert.match(screen, /<RecordMyself\n\s+kind="chapter"/);
  assert.match(screen, /<PracticeTimerLine profileId=\{myId\} onSaved=\{nothing\} \/>/);
  assert.match(screen, /router\.setParams\(\{ tab: next \}\)/);
  assert.match(screen, /router\.replace\(chapterHref\(area, chapter\.id\)\)/);
  assert.match(screen, /saveLastChapter\(/);
  // Nothing plays by itself.
  assert.doesNotMatch(screen, /\.play\(\)/);
  assert.doesNotMatch(src('components/lesson-audio.tsx'), /\.play\(\)\s*;?\s*\n\s*\}, \[/);
  assert.match(src('components/lesson-video-panel.tsx'), /if \(playing\) onPlay\?\.\(\);/);
  assert.match(src('components/lesson-audio.tsx'), /if \(status\.playing\) onPlay\?\.\(\);/);
  // Both areas have the route; the own-record one reuses the screen.
  assert.match(src('app/student/chapter/[id].tsx'), /<ChapterScreen \/>/);
  assert.match(src('app/staff/me/chapter/[id].tsx'), /<ChapterScreen \/>/);
});

test('My Learning: lessons fold open one at a time, Continue learning on top and on the Learn tab', () => {
  const page = src('app/student/progress.tsx');
  assert.match(page, /onToggle=\{\(\) => setOpenLesson\(\(key\) => \(key === lesson\.key \? null : lesson\.key\)\)\}/);
  assert.match(page, /t\('chapter\.doneCount', \{ done, total \}\)/);
  assert.match(page, /onOpen=\{\(\) => router\.push\(chapterHref\(area, item\.id\)\)\}/);
  assert.match(page, /title=\{t\('chapter\.continue'\)\}/);
  const fold = src('components/lesson-fold.tsx');
  assert.match(fold, /aria-expanded=\{folds \? open : undefined\}/);
  assert.match(fold, /minHeight: 56/);
  // The Learn tab is in the first web download (#650): it reads the phone's note, never the chapter screen's code.
  const tab = src('app/student/(tabs)/learn.tsx');
  assert.match(tab, /lastChapter\(myId\)/);
  assert.doesNotMatch(tab, /screens\/chapter/);
});

test('new displays never join bols with "|" (the vibhāg line)', () => {
  for (const file of ['screens/chapter.tsx', 'components/lesson-fold.tsx', 'lib/study-lessons.ts', 'app/student/progress.tsx']) {
    assert.doesNotMatch(src(file), /join\(['"`]\s*\|\s*['"`]\)/, file);
  }
});

test('the new strings are in English, Telugu and Hindi, with the same placeholders', () => {
  const en = locale('en');
  for (const lang of ['te', 'hi']) {
    const l = locale(lang);
    for (const [key, text] of Object.entries(en.chapter)) {
      assert.equal(typeof l.chapter[key], 'string', `${lang} chapter.${key}`);
      assert.deepEqual(l.chapter[key].match(/\{\{\w+\}\}/g)?.sort() ?? [], text.match(/\{\{\w+\}\}/g)?.sort() ?? [], `${lang} chapter.${key}`);
    }
    assert.equal(typeof l.lessonPlayer.repeat, 'string');
  }
  assert.equal(en.chapter.doneCount, '{{done}} of {{total}} chapters done');
  assert.equal(en.chapter.comingSoonTitle, 'Coming soon');
});
