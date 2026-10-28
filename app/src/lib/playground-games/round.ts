// What every Playground listening game does with a round the engine made (docs/RHYTHM_PLAYGROUND.md §6.1 game flow,
// §7 feedback words, §12.1; docs/DECISIONS.md #736): two tries per challenge, the feedback after each pick, the
// item saved for the round (record_round re-marks it), the round's summary and the round as queued for sending. The
// rounds themselves come from the engine (lib/playground/generator.ts, package W1); nothing here chooses content.

import type { Challenge, Device, GeneratedRound, PlayedRound, RoundItem, SkillId } from '../playground/types';

/** Picks before the answer is shown and played (§7.1 "after 2 tries"). */
export const TRIES = 2;

/** What a pick leads to: right; not yet, with a try left ("listen again"); or the last try used (answer shown). */
export type PickOutcome = 'right' | 'again' | 'shown';

/** The outcome of the `tries`-th pick (1 = the first). */
export function pickOutcome(tries: number, right: boolean): PickOutcome {
  if (right) return 'right';
  return tries >= TRIES ? 'shown' : 'again';
}

/** The feedback words (§7): never "wrong", "failed" or "off beat"; shown with an icon, never by colour alone. */
export function feedbackKey(outcome: PickOutcome): 'playground.feedback.right' | 'playground.feedback.again' | 'playground.feedback.shown' {
  return outcome === 'right' ? 'playground.feedback.right' : outcome === 'again' ? 'playground.feedback.again' : 'playground.feedback.shown';
}

/** The feedback icon, beside the words. */
export function feedbackIcon(outcome: PickOutcome): 'tick' | 'listen' | 'info' {
  return outcome === 'right' ? 'tick' : outcome === 'again' ? 'listen' : 'info';
}

/** How one challenge went, as the screen counts it. */
export type Answered = {
  /** The first answer given, as an answer key ('na', 'te.re khe', 'faster'). */
  given: string;
  /** Right at the first pick: what recognition counts (a second-try right is practice, not evidence). */
  ok: boolean;
  /** Picks made (1 or 2). */
  tries: number;
  /** "Hear it again" taps: more replays = less sure, never "worse" (§7.1). */
  replays: number;
  /** From the challenge shown to the first pick. */
  ms: number;
};

/** The challenge as saved in the round (play_rounds.items, short keys; the server checks `a` again). */
export function savedItem(challenge: Challenge, answered: Answered): RoundItem {
  return {
    e: challenge.exerciseId,
    r: challenge.revision,
    q: challenge.query,
    a: answered.given,
    ok: answered.ok,
    rp: answered.replays,
    ms: Math.max(0, Math.round(answered.ms)),
    rv: challenge.review,
    tr: answered.tries,
  };
}

/** The round's summary: "You recognised 6 of 8", the review items, and the pairs that were close. */
export type RoundSummary = { correct: number; total: number; review: number; close: (readonly [string, string])[] };

/**
 * Sums up a round. `mixed` gives, for a challenge answered wrongly at the first pick, the right answer and the pick
 * as the cards showed them (Sound Detective's "tā and nā were close"); each pair is named once, either way round.
 */
export function summarise(
  items: readonly RoundItem[],
  mixed: readonly (readonly [string, string])[] = [],
): RoundSummary {
  const close: (readonly [string, string])[] = [];
  for (const [a, b] of mixed) {
    if (a !== b && !close.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) close.push([a, b]);
  }
  return {
    correct: items.filter((i) => i.ok).length,
    total: items.length,
    review: items.filter((i) => i.rv).length,
    close,
  };
}

/** The finished (or left) round, for the queue that sends it (lib/playground/round-queue.ts). */
export function playedRound(input: {
  id: string;
  round: GeneratedRound;
  skill?: SkillId;
  startedAt: Date;
  finishedAt: Date | null;
  items: RoundItem[];
  device: Device | null;
}): PlayedRound {
  const { recipe } = input.round;
  return {
    id: input.id,
    game: recipe.game,
    skill: input.skill ?? input.round.skill,
    mode: recipe.mode,
    levelId: recipe.levelId,
    step: recipe.step,
    seed: recipe.seed,
    contentVersion: recipe.contentVersion,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt ? input.finishedAt.toISOString() : null,
    items: input.items,
    timing: null,
    device: input.device,
  };
}
