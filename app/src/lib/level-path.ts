// The level path (audit 22-10-2026 fix 12, docs/DECISIONS.md #620): "7 of 20 in Beginner" with a calm bar, the next
// item or two to learn in teaching order, and the level that comes after. Worked out on the phone from the student's
// syllabus with ticks (data/syllabus.ts), so the count is the one My progress has always shown: items in use of the
// current level, retired ones left out (#44). Pure, no database: tested in tests/level-path.test.mjs.

/** The parts of a syllabus item the path needs (data/syllabus.ts SyllabusEntry has them all). */
export type PathItem = {
  id: number;
  levelId: number;
  /** Position in the level's teaching order, 1 first. */
  sort: number;
  title: string;
  /** 'YYYY-MM-DD' it was ticked, or null. */
  doneOn: string | null;
  retired: boolean;
};

/** How many next items the path names. */
export const NEXT_COUNT = 2;

/** Where the student is on their level. */
export type LevelPath = {
  levelId: number;
  /** Ticked items in use of the level. */
  done: number;
  /** Items in use of the level. */
  total: number;
  /** The first items in teaching order not ticked yet, at most NEXT_COUNT. */
  next: PathItem[];
  /** The level after this one, or null at the top level. */
  nextLevelId: number | null;
  /** The level has items and every one of them is ticked. */
  complete: boolean;
};

/**
 * The level that comes after `levelId` in `levelIds` (the levels in order, i18n/labels.ts LEVEL_IDS), or null for
 * the last level or a level not in the list.
 */
export function nextLevelOf(levelId: number, levelIds: readonly number[]): number | null {
  const at = levelIds.indexOf(levelId);
  return at < 0 || at === levelIds.length - 1 ? null : levelIds[at + 1];
}

/**
 * The path of `levelId` from the syllabus (items of any level may be passed; only that level's count). Retired
 * items neither count nor come next.
 */
export function levelPath(items: readonly PathItem[], levelId: number, levelIds: readonly number[]): LevelPath {
  const inUse = items.filter((item) => item.levelId === levelId && !item.retired).sort((a, b) => a.sort - b.sort);
  const done = inUse.filter((item) => item.doneOn !== null).length;
  return {
    levelId,
    done,
    total: inUse.length,
    next: inUse.filter((item) => item.doneOn === null).slice(0, NEXT_COUNT),
    nextLevelId: nextLevelOf(levelId, levelIds),
    complete: inUse.length > 0 && done === inUse.length,
  };
}
