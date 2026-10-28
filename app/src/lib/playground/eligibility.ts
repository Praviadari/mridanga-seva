// The curriculum guard (docs/RHYTHM_PLAYGROUND.md §8.5, DYN-01, DYN-03; #723): which exercises a student may get.
// An exercise is eligible only when all of these hold:
//   1. it is in the published pack (approved, published) and not a placeholder, unless the pack is TEST's
//      with placeholders switched on (§19.3);
//   2. its level is the student's or lower (one level up when the facilitator allows it);
//   3. every bol of its sequence is a dictionary bol of the pack, taught at that level or lower;
//   4. its syllabus item, if it names one, is ticked for the student;
//   5. every sound it needs is there: its recorded prompts are in the pack and ready (cached or downloadable
//      now), and each bol has an approved recording or a stroke the app can sound;
//   6. (at generation) the tempo is inside its BPM range and the guna is one it and its level allow;
//   7. the game has an approved template for the student's level. Assigned skills come first (generator.ts).
// Levels are compared by id, as the practice tools do (1 Beginner, 2 Intermediate, 3 Advanced).

import { readBol } from '@/lib/bols';

import { bolIndex, sequenceBols } from './notation';
import type { GameId, PlayBol, PlayExercise, PlayPack, PlayTemplate } from './types';

export type EligibilityContext = {
  pack: PlayPack;
  levelId: number;
  levelUpOk: boolean;
  /** Syllabus items ticked for the student. */
  ticked: readonly number[];
  /** Is this recording on the phone or downloadable now? Default: yes. */
  soundReady?: (assetId: number) => boolean;
};

export type Ineligible =
  | 'placeholder'
  | 'level'
  | 'bol_unknown'
  | 'bol_level'
  | 'not_ticked'
  | 'sound_missing'
  | 'no_template';

/** The highest level whose content the student may get. */
export function topLevel(ctx: Pick<EligibilityContext, 'levelId' | 'levelUpOk'>): number {
  return ctx.levelId + (ctx.levelUpOk ? 1 : 0);
}

/** The game's approved template for a level: the one with the lowest id that covers it. */
export function templateFor(pack: PlayPack, game: GameId, levelId: number): PlayTemplate | null {
  let found: PlayTemplate | null = null;
  for (const t of pack.templates) {
    if (t.game !== game || t.levelMin > levelId || t.levelMax < levelId) continue;
    if (!found || t.id < found.id) found = t;
  }
  return found;
}

/** The dictionary bols taught up to a level (placeholders only when the pack allows them). */
export function levelBols(pack: PlayPack, maxLevel: number): PlayBol[] {
  return pack.bols.filter((b) => b.levelId <= maxLevel && (!b.placeholder || pack.placeholders));
}

/** Can the app sound this bol: a recording that is ready, or a stroke lib/bols.ts knows? */
export function bolSounds(bol: PlayBol, pack: PlayPack, soundReady: (assetId: number) => boolean): boolean {
  if (bol.assetId !== null) {
    if (pack.assets.some((a) => a.id === bol.assetId) && soundReady(bol.assetId)) return true;
  }
  return !readBol(bol.id).unknown;
}

/** Why an exercise is not for this student, or null when it is (rules 1-5 and 7). */
export function whyIneligible(ex: PlayExercise, ctx: EligibilityContext): Ineligible | null {
  const { pack } = ctx;
  const max = topLevel(ctx);
  const ready = ctx.soundReady ?? (() => true);
  if (ex.placeholder && !pack.placeholders) return 'placeholder';
  if (ex.levelId > max) return 'level';
  const index = bolIndex(pack.bols);
  for (const id of sequenceBols(ex.sequence ?? [])) {
    const bol = index.get(id);
    if (!bol || (bol.placeholder && !pack.placeholders)) return 'bol_unknown';
    if (bol.levelId > max) return 'bol_level';
    if (!bolSounds(bol, pack, ready)) return 'sound_missing';
  }
  if (ex.requiresItem !== null && !ctx.ticked.includes(ex.requiresItem)) return 'not_ticked';
  for (const assetId of ex.promptAssets) {
    const asset = pack.assets.find((a) => a.id === assetId);
    if (!asset || (asset.placeholder && !pack.placeholders) || !ready(assetId)) return 'sound_missing';
  }
  if (!templateFor(pack, ex.game, ctx.levelId)) return 'no_template';
  return null;
}

/** The game's eligible exercises, in id order. */
export function eligibleExercises(ctx: EligibilityContext, game: GameId): PlayExercise[] {
  return ctx.pack.exercises.filter((ex) => ex.game === game && whyIneligible(ex, ctx) === null).sort((a, b) => a.id - b.id);
}

/** The guna a challenge of this exercise may use at a level: its own list, narrowed by the template's per level. */
export function allowedGuna(ex: PlayExercise, template: PlayTemplate | null, levelId: number): number[] {
  const own = ex.guna.length > 0 ? ex.guna : [1];
  const byLevel = template?.params.gunaByLevel?.[String(levelId)];
  return byLevel ? own.filter((g) => byLevel.includes(g)) : own;
}

/** Is a tempo inside the exercise's approved range (an open end is not a limit; 30-240 always)? */
export function tempoInRange(ex: PlayExercise, bpm: number): boolean {
  if (!(bpm >= 30 && bpm <= 240)) return false;
  if (ex.bpmMin !== null && bpm < ex.bpmMin) return false;
  if (ex.bpmMax !== null && bpm > ex.bpmMax) return false;
  return true;
}
