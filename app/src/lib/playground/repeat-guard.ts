// The repeat guard and spaced review (docs/RHYTHM_PLAYGROUND.md §8.6-§8.7, DYN-02, DYN-07; #724):
//   1. never back-to-back: the same exercise never comes twice in a row (also across the previous round's last
//      item) while another eligible one exists;
//   2. recent exclusion: exercises of the last K items of the game are left out, K = min(8, pool − round length);
//   3. freshness: items not seen for 3+ days (or never) are three times as likely;
//   4. spaced review: an item answered wrongly comes back 1 day later, then 3, then 7 (three boxes; a right review
//      answer moves it on, a wrong one starts again); at most a third of a round is review, labelled "Review";
//   5. Daily Mission and Surprise me: no skill twice in a row, and not yesterday's pair of games;
//   6. the history is this phone's rounds plus the student's saved rounds of the last 30 days (a new phone
//      does not start from nothing).
// Too few eligible items (fewer than max(6, 2 × round length)): "Review practice" — items may repeat, still never
// back-to-back when two exist; nothing new is made up (§8.7).

import type { Rng } from './rng';
import type { GameId, PlayedRound, SkillId } from './types';

/** One answered item of the history. */
export type SeenItem = { exerciseId: number; game: GameId; at: number; ok: boolean | null; review: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days until a wrongly answered item returns, per box (§8.6 rule 4). */
export const REVIEW_DAYS = [1, 3, 7] as const;
export const FRESH_DAYS = 3;
export const MAX_EXCLUDED = 8;
export const DEFAULT_REVIEW_SHARE = 1 / 3;

/** The history's items, oldest first (rounds may come in any order; one id counted once). */
export function seenItems(rounds: readonly PlayedRound[]): SeenItem[] {
  const seenRounds = new Set<string>();
  const out: SeenItem[] = [];
  for (const round of rounds) {
    if (seenRounds.has(round.id)) continue;
    seenRounds.add(round.id);
    const start = Date.parse(round.startedAt);
    const end = round.finishedAt ? Date.parse(round.finishedAt) : start;
    round.items.forEach((item, i) => {
      // Items of a round are spread over its time, so their order survives the sort.
      const at = round.items.length > 1 ? start + ((end - start) * i) / (round.items.length - 1) : end;
      out.push({ exerciseId: item.e, game: round.game, at, ok: item.ok ?? null, review: Boolean(item.rv) });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Is the pool too small for fresh rounds (§8.7)? */
export function isLowContent(poolSize: number, roundLen: number): boolean {
  return poolSize < Math.max(6, 2 * roundLen);
}

/** K of rule 2. */
export function recentExclusion(poolSize: number, roundLen: number): number {
  return Math.max(0, Math.min(MAX_EXCLUDED, poolSize - roundLen));
}

/**
 * When each exercise of a game is due for review, for those that are: the box (0-2) and the time it became due.
 * An exercise never answered wrongly, or answered right three times since, is not listed.
 */
export function reviewsDue(seen: readonly SeenItem[], game: GameId, now: number): { exerciseId: number; dueAt: number }[] {
  const byId = new Map<number, SeenItem[]>();
  for (const s of seen) {
    if (s.game !== game) continue;
    const list = byId.get(s.exerciseId) ?? [];
    list.push(s);
    byId.set(s.exerciseId, list);
  }
  const due: { exerciseId: number; dueAt: number }[] = [];
  for (const [exerciseId, list] of byId) {
    let wrongAt = -1;
    list.forEach((s, i) => {
      if (s.ok === false) wrongAt = i;
    });
    if (wrongAt < 0) continue;
    const after = list.slice(wrongAt + 1).filter((s) => s.ok === true);
    if (after.length >= REVIEW_DAYS.length) continue;
    const from = after.length === 0 ? list[wrongAt].at : after[after.length - 1].at;
    const dueAt = from + REVIEW_DAYS[after.length] * DAY_MS;
    if (dueAt <= now) due.push({ exerciseId, dueAt });
  }
  return due.sort((a, b) => a.dueAt - b.dueAt || a.exerciseId - b.exerciseId);
}

/** One slot of a round: which exercise, and whether it is a review. */
export type Pick = { exerciseId: number; review: boolean };

export type PickInput = {
  /** The eligible exercise ids (already through the curriculum guard). */
  pool: readonly number[];
  game: GameId;
  roundLen: number;
  seen: readonly SeenItem[];
  now: number;
  rng: Rng;
  reviewShare?: number;
  /** Preferred ids (an assigned skill's): twice as likely. */
  preferred?: readonly number[];
};

/** Chooses the round's exercises by rules 1-4 and the low-content rule. */
export function pickExercises(input: PickInput): { picks: Pick[]; lowContent: boolean } {
  const { game, roundLen, seen, now, rng } = input;
  const pool = [...new Set(input.pool)].sort((a, b) => a - b);
  if (pool.length === 0 || roundLen < 1) return { picks: [], lowContent: true };
  const lowContent = isLowContent(pool.length, roundLen);
  const gameSeen = seen.filter((s) => s.game === game);
  const prevLast = gameSeen.length > 0 ? gameSeen[gameSeen.length - 1].exerciseId : null;

  // Rule 4: review first, at most a share of the round.
  const maxReview = Math.floor(roundLen * (input.reviewShare ?? DEFAULT_REVIEW_SHARE));
  const reviewIds = reviewsDue(seen, game, now)
    .map((d) => d.exerciseId)
    .filter((id) => pool.includes(id))
    .slice(0, maxReview);

  // Rule 2: leave out the last K items' exercises (not when content is low).
  const k = lowContent ? 0 : recentExclusion(pool.length, roundLen);
  const excluded = new Set(k === 0 ? [] : gameSeen.slice(gameSeen.length - k).map((s) => s.exerciseId));
  let candidates = pool.filter((id) => !excluded.has(id) && !reviewIds.includes(id));
  if (candidates.length < roundLen - reviewIds.length) candidates = pool.filter((id) => !reviewIds.includes(id));

  // Rule 3: weights.
  const lastSeen = new Map<number, number>();
  for (const s of gameSeen) lastSeen.set(s.exerciseId, s.at);
  const weight = (id: number) => {
    const at = lastSeen.get(id);
    const fresh = at === undefined || now - at >= FRESH_DAYS * DAY_MS;
    return (fresh ? 3 : 1) * (input.preferred?.includes(id) ? 2 : 1);
  };

  const fresh: number[] = [];
  let remaining = [...candidates];
  const want = roundLen - reviewIds.length;
  while (fresh.length < want) {
    if (remaining.length === 0) {
      if (candidates.length === 0) break;
      // Low content: go round the pool again (§8.7: items may repeat).
      remaining = [...candidates];
    }
    const total = remaining.reduce((sum, id) => sum + weight(id), 0);
    let r = rng.next() * total;
    let at = 0;
    for (; at < remaining.length - 1; at++) {
      r -= weight(remaining[at]);
      if (r < 0) break;
    }
    fresh.push(remaining[at]);
    remaining.splice(at, 1);
  }

  // Review items go to random places among the fresh ones.
  const slots: Pick[] = fresh.map((id) => ({ exerciseId: id, review: false }));
  for (const id of reviewIds) slots.splice(rng.int(0, slots.length), 0, { exerciseId: id, review: true });
  return { picks: avoidBackToBack(slots, prevLast, rng), lowContent };
}

/**
 * Orders the picks so the same exercise never comes twice in a row (nor first after `prevLast`) whenever the
 * multiset allows it: at each place the first pick (in the shuffled order) that differs from the one before,
 * unless one exercise is so frequent it must go now.
 */
export function avoidBackToBack(picks: readonly Pick[], prevLast: number | null, rng: Rng): Pick[] {
  const rest = rng.shuffle(picks);
  const out: Pick[] = [];
  let prev = prevLast;
  while (rest.length > 0) {
    const counts = new Map<number, number>();
    for (const p of rest) counts.set(p.exerciseId, (counts.get(p.exerciseId) ?? 0) + 1);
    let at = -1;
    for (const [id, n] of counts) {
      if (id !== prev && n > rest.length / 2) at = rest.findIndex((p) => p.exerciseId === id);
    }
    if (at < 0) at = rest.findIndex((p) => p.exerciseId !== prev);
    if (at < 0) at = 0; // only the same exercise is left: nothing else exists
    const [p] = rest.splice(at, 1);
    out.push(p);
    prev = p.exerciseId;
  }
  return out;
}

/** A game the Daily Mission or Surprise me may offer. */
export type GameOption = { game: GameId; skill: SkillId };

/**
 * Rule 5: `n` games for today's Daily Mission or Surprise me — no skill twice in a row and, when another
 * choice exists, not exactly yesterday's games.
 */
export function pickDailyGames(options: readonly GameOption[], yesterday: readonly GameId[], n: number, rng: Rng): GameOption[] {
  const sameAsYesterday = (list: GameOption[]) =>
    yesterday.length > 0 && list.length === yesterday.length && list.every((o) => yesterday.includes(o.game));
  let best: GameOption[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const order = rng.shuffle(options);
    const out: GameOption[] = [];
    for (const option of order) {
      if (out.length >= n) break;
      if (out.some((o) => o.game === option.game)) continue;
      if (out.length > 0 && out[out.length - 1].skill === option.skill) continue;
      out.push(option);
    }
    if (out.length > best.length || (out.length === best.length && sameAsYesterday(best) && !sameAsYesterday(out))) best = out;
    if (out.length === Math.min(n, options.length) && !sameAsYesterday(out)) return out;
  }
  return best;
}
