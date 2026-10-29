// Sections in the syllabus (docs/DECISIONS.md #773, migration 0072): an item may name its section, e.g. the team's
// Intermediate "Section 1: Core Practice – Hand Practice, Mantras, Tāla, Mātrās". A section is a heading over items
// that sit together in teaching order; the lists show a heading wherever the section changes and nothing when a level
// has no sections at all (as before). Pure, no database: tested in tests/syllabus-sections.test.mjs.

/** Longest section, as in the database (0072). */
export const SECTION_MAX = 100;

/** One run of items of the same section, in teaching order. `section` null = items without a section. */
export type SectionRun<T> = { section: string | null; items: T[] };

/** A section as the database keeps it: trimmed, inner spaces and line breaks one space, empty = none. */
export function cleanSection(text: string | null | undefined): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean === '' ? null : clean;
}

/**
 * The items (already in teaching order) cut into runs of one section. A level with no sections is one run with
 * section null, so a list can show it exactly as before. Items the Guru put out of order make a section appear twice:
 * the screen shows that honestly, so the Guru can move them together.
 */
export function sectionRuns<T extends { section: string | null }>(items: readonly T[]): SectionRun<T>[] {
  const runs: SectionRun<T>[] = [];
  for (const item of items) {
    const section = cleanSection(item.section);
    const last = runs[runs.length - 1];
    if (last && last.section === section) last.items.push(item);
    else runs.push({ section, items: [item] });
  }
  return runs;
}

/** True when any item names a section (then items without one get the "Other lessons" heading). */
export function hasSections(items: readonly { section: string | null }[]): boolean {
  return items.some((item) => cleanSection(item.section) !== null);
}

/** The level's sections in teaching order, each once: what the editor offers to pick from. */
export function sectionNames(items: readonly { section: string | null }[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    const section = cleanSection(item.section);
    if (section !== null && !names.includes(section)) names.push(section);
  }
  return names;
}
