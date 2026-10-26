// Small celebrations on the student home (audit 22-10-2026 fix 12, docs/DECISIONS.md #621-#623): a calm card when a
// syllabus item was ticked in class, a practice milestone was reached (lib/milestones.ts, #493) or the Guru moved the
// student up a level. Each event is shown once on this phone for this login: the keys of the events already known are
// kept on the device (lib/local-storage.ts), like the welcome (lib/welcome.ts). The first time on a phone only the
// events of the last CELEBRATE_WITHIN_DAYS days count as new, so an update does not celebrate a whole year at once.
// No points, no confetti; the card itself is components/celebration-card.tsx.

import type { Milestone } from './milestones';
import { readLocal, writeLocal } from './local-storage';
import { daysBetween } from './welcome';

/** On a phone with nothing kept yet, events this many days old or newer are still celebrated. */
export const CELEBRATE_WITHIN_DAYS = 7;

/** One thing to celebrate. `on` is the day it happened, 'YYYY-MM-DD'. */
export type CelebrationEvent =
  | { kind: 'level'; key: string; on: string; levelId: number }
  | { kind: 'milestone'; key: string; on: string; milestone: Milestone }
  | { kind: 'tick'; key: string; on: string; title: string };

/** A row of level_history the student reads (their own, 0001). */
export type LevelChange = { id: number; fromLevel: number | null; toLevel: number; changedOn: string };

/** A ticked or unticked syllabus item, as data/syllabus.ts gives it. */
type TickItem = { id: number; title: string; doneOn: string | null; retired: boolean };

const KIND_ORDER: Record<CelebrationEvent['kind'], number> = { level: 0, milestone: 1, tick: 2 };

/**
 * Every event the student has: each ticked item in use (any level), each milestone reached, and each move up a level
 * (`levelIds` in order; the first placement and a move down are not celebrated).
 */
export function celebrationEvents(
  items: readonly TickItem[],
  levelChanges: readonly LevelChange[],
  reached: readonly Milestone[],
  levelIds: readonly number[],
): CelebrationEvent[] {
  const events: CelebrationEvent[] = [];
  for (const change of levelChanges) {
    const from = change.fromLevel === null ? -1 : levelIds.indexOf(change.fromLevel);
    if (from >= 0 && levelIds.indexOf(change.toLevel) > from) {
      events.push({ kind: 'level', key: `level:${change.id}`, on: change.changedOn, levelId: change.toLevel });
    }
  }
  for (const m of reached) {
    if (m.reachedOn) events.push({ kind: 'milestone', key: `milestone:${m.id}`, on: m.reachedOn, milestone: m });
  }
  for (const item of items) {
    if (item.doneOn && !item.retired) events.push({ kind: 'tick', key: `tick:${item.id}`, on: item.doneOn, title: item.title });
  }
  return events;
}

/**
 * The events to celebrate now and the keys to keep afterwards. `known` = the keys kept on this phone, or null when
 * nothing is kept yet (then only events of the last CELEBRATE_WITHIN_DAYS days up to `today` are new). The events come
 * level first, then milestones, then ticks, newest first within each. `keep` holds every key ever known, so an item
 * unticked and ticked again is not celebrated twice.
 */
export function dueCelebrations(
  events: readonly CelebrationEvent[],
  known: readonly string[] | null,
  today: string,
): { due: CelebrationEvent[]; keep: string[] } {
  const seen = new Set(known ?? []);
  const isNew = (e: CelebrationEvent) => {
    if (known !== null) return !seen.has(e.key);
    const age = daysBetween(e.on, today);
    return age >= 0 && age <= CELEBRATE_WITHIN_DAYS;
  };
  const due = events
    .filter(isNew)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.on.localeCompare(a.on) || a.key.localeCompare(b.key));
  return { due, keep: [...new Set([...seen, ...events.map((e) => e.key)])] };
}

const keyFor = (profileId: string) => `celebrated:${profileId}`;

/** The event keys this login already knows on this phone, or null when none are kept (or they cannot be read). */
export function knownCelebrations(profileId: string): string[] | null {
  const raw = readLocal(keyFor(profileId));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : null;
  } catch {
    return null;
  }
}

/** Keeps the event keys of this login on this phone. */
export function keepCelebrations(profileId: string, keys: readonly string[]): void {
  writeLocal(keyFor(profileId), JSON.stringify(keys));
}

/**
 * The events this login has not been shown yet on this phone; they count as shown from now on, so leaving the home
 * before closing the card does not bring it back.
 */
export function takeDueCelebrations(profileId: string, events: readonly CelebrationEvent[], today: string): CelebrationEvent[] {
  const known = knownCelebrations(profileId);
  const { due, keep } = dueCelebrations(events, known, today);
  if (known === null || keep.length !== known.length) keepCelebrations(profileId, keep);
  return due;
}
