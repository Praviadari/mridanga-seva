// The Playground's seeded random numbers (docs/RHYTHM_PLAYGROUND.md §8.4; #721): the same seed gives the same
// numbers on every phone and browser, so a round can be rebuilt exactly from its recipe (DYN-06). 32-bit
// integer arithmetic only (Math.imul, >>>), never Math.random.

/** A seed: a whole number 0..2^32-1 (saved as play_rounds.seed). */
export type Seed = number;

/** FNV-1a over the text's UTF-16 code units: a 32-bit hash, the same everywhere. */
export function hash32(text: string): Seed {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The seed of a round: student + game + the class day + the day's round number (§8.4). Two rounds of the same
 * day differ; the same round asked for again (a reload) is the same.
 */
export function roundSeed(studentId: string, game: string, day: string, roundOfDay: number): Seed {
  return hash32(`${studentId}|${game}|${day}|${roundOfDay}`);
}

/** Random numbers from a seed: mulberry32. */
export type Rng = {
  /** 0 <= n < 1. */
  next(): number;
  /** A whole number min..max (both included). */
  int(min: number, max: number): number;
  /** One element; undefined for an empty list. */
  pick<T>(items: readonly T[]): T | undefined;
  /** A shuffled copy (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
};

export function makeRng(seed: Seed): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => (max < min ? min : min + Math.floor(next() * (max - min + 1)));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]) => (items.length === 0 ? undefined : items[int(0, items.length - 1)]),
    shuffle: <T>(items: readonly T[]) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
