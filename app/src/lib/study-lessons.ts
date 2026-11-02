// Study material as lessons and chapters (docs/DECISIONS.md #785; the team's "Study Material Navigation" draft of
// 02-11-2026). No table of its own: a section of the syllabus (#773, 0072) is a Lesson and its items are its Chapters;
// an item with no section is a lesson of one chapter, whose row opens the chapter at once. Teaching order throughout,
// so Previous / Next walk the chapters as the class learns them and the last chapter of a lesson leads to the next
// lesson. Pure, no database: tested in tests/study-material.test.mjs.

import { sectionRuns } from './syllabus-sections';

/** What a chapter needs here: a syllabus item (data/syllabus.ts SyllabusEntry has these). */
export type ChapterItem = { id: number; section: string | null; doneOn: string | null; retired: boolean };

/** One lesson: a section with its items, or one item without a section (`single`). */
export type StudyLesson<T extends ChapterItem> = {
  /** Stable while the syllabus stays: the section's name, or the lone item's id. */
  key: string;
  /** The section's name; null for a lesson of one item without a section (its title is the item's). */
  section: string | null;
  chapters: T[];
  single: boolean;
};

/** The level's items (already in teaching order) as lessons. */
export function studyLessons<T extends ChapterItem>(items: readonly T[]): StudyLesson<T>[] {
  return sectionRuns(items).flatMap((run, r): StudyLesson<T>[] =>
    run.section === null
      ? run.items.map((item) => ({ key: `item:${item.id}`, section: null, chapters: [item], single: true }))
      : // A section the Guru split by putting items out of order shows twice; the run number keeps the keys apart.
        [{ key: `section:${r}:${run.section}`, section: run.section, chapters: run.items, single: false }],
  );
}

/** "n of m chapters done": ticked chapters among those in use; a retired item (listed because ticked) does not count. */
export function chaptersDone(lesson: StudyLesson<ChapterItem>): { done: number; total: number } {
  const inUse = lesson.chapters.filter((c) => !c.retired);
  return { done: inUse.filter((c) => c.doneOn !== null).length, total: inUse.length };
}

/** The lesson a chapter is in, or null when the item is not in this level. */
export function lessonOf<T extends ChapterItem>(lessons: readonly StudyLesson<T>[], itemId: number): StudyLesson<T> | null {
  return lessons.find((l) => l.chapters.some((c) => c.id === itemId)) ?? null;
}

/** A chapter's neighbours in teaching order across lessons; `nextLesson` = the next chapter starts another lesson. */
export type ChapterSteps<T> = { previous: T | null; next: T | null; nextLesson: boolean };

/** Previous / Next of a chapter: the last chapter of a lesson leads to the next lesson's first; the very last has none. */
export function chapterSteps<T extends ChapterItem>(lessons: readonly StudyLesson<T>[], itemId: number): ChapterSteps<T> {
  const order = lessons.flatMap((l) => l.chapters.map((c) => ({ chapter: c, lesson: l.key })));
  const at = order.findIndex((o) => o.chapter.id === itemId);
  if (at < 0) return { previous: null, next: null, nextLesson: false };
  const next = order[at + 1] ?? null;
  return { previous: order[at - 1]?.chapter ?? null, next: next?.chapter ?? null, nextLesson: next !== null && next.lesson !== order[at].lesson };
}

/** The chapter screen's tabs, always all three: a tab with nothing says "Coming soon". */
export const CHAPTER_TABS = ['video', 'audio', 'notes'] as const;
export type ChapterTab = (typeof CHAPTER_TABS)[number];

/** What the chapter has of each medium. */
export type ChapterMedia = { videos: number; audios: number; notes: number };

/** The tab a chapter opens on (the team's rule): Video if it has one, else Audio, else Notes. */
export function defaultTab(media: ChapterMedia): ChapterTab {
  return media.videos > 0 ? 'video' : media.audios > 0 ? 'audio' : 'notes';
}

/** A tab named in the address (`?tab=audio`), or null for anything else. */
export function tabParam(value: unknown): ChapterTab | null {
  return typeof value === 'string' && (CHAPTER_TABS as readonly string[]).includes(value) ? (value as ChapterTab) : null;
}
