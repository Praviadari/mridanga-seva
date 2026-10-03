// What a practice player does, on the phone (practice-audio.ts) and in the browser
// (practice-audio.web.ts): loop one pattern (lib/practice-pattern.ts) at a tempo, change the tempo
// while playing, and say which beat is being heard now so the screen (beat dots, beat grid, the
// two-head view) can light it in time with the sound.

import type { Pattern } from './practice-pattern';

/** Where the sound is: the beat being heard within the cycle (fractional) and the cycle count. */
export type PlayerPosition = { beat: number; cycle: number };

export type PracticePlayer = {
  /** Starts looping `pattern` at `bpm` beats a minute. false = no sound possible here. */
  start(pattern: Pattern, bpm: number): Promise<boolean>;
  /** Changes the tempo while playing, keeping the place in the cycle. */
  setTempo(bpm: number): void;
  stop(): void;
  /** The beat being heard now, or null when stopped (or before the first beat). */
  position(): PlayerPosition | null;
  /** Frees the audio; the screen is going away. */
  dispose(): void;
};
