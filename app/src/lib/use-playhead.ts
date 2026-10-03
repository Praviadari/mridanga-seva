// Follows a practice player (lib/practice-player.ts) on every screen frame and says which beat and
// which bol are being heard, so the beat dots, the beat grid and the two-head view light up in time
// with the sound. The screen re-renders only when that changes (a few times a beat), not 60 times
// a second.

import { useEffect, useState } from 'react';

import type { Pattern } from './practice-pattern';
import type { PracticePlayer } from './practice-player';

/** What is being heard. */
export type Playhead = {
  /** Beat of the cycle being heard (0-based), a rest too: for the beat dots and the grid. */
  beat: number;
  /** Beat of the last bol that started, and which bol of it (0-based): for the two-head view. */
  bolBeat: number;
  part: number;
  /** True for a short moment after the bol starts: the zone is lit brightly, then dimmed. */
  fresh: boolean;
  /** Counts the bols heard, so the same bol played twice in a row is seen as two. */
  count: number;
};

/** How long a stroke stays bright, seconds (shorter at fast tempos). */
const FRESH_SECONDS = 0.16;

/** The playhead of `player` while `playing`, or null. */
export function usePlayhead(player: PracticePlayer, pattern: Pattern | null, bpm: number, playing: boolean): Playhead | null {
  const [head, setHead] = useState<Playhead | null>(null);

  useEffect(() => {
    if (!playing || !pattern || pattern.events.length === 0) return;
    let frame = 0;
    let lastKey = '';
    const step = () => {
      const at = player.position();
      if (at) {
        // The last bol that has started: events are sorted by `at`.
        let index = -1;
        for (let i = 0; i < pattern.events.length; i++) {
          if (pattern.events[i].at <= at.beat + 1e-6) index = i;
          else break;
        }
        // Before the first bol of a cycle: still the last bol of the previous cycle.
        const cycle = index === -1 ? at.cycle - 1 : at.cycle;
        const event = pattern.events[index === -1 ? pattern.events.length - 1 : index];
        const since = ((at.beat - event.at + (index === -1 ? pattern.beats : 0)) * 60) / bpm;
        const fresh = since < Math.min(FRESH_SECONDS, (0.6 * 60) / bpm);
        const count = cycle * pattern.events.length + (index === -1 ? pattern.events.length - 1 : index);
        const beat = Math.min(pattern.beats - 1, Math.floor(at.beat));
        const key = `${count}:${fresh}:${beat}`;
        if (key !== lastKey) {
          lastKey = key;
          setHead({ beat, bolBeat: event.beat, part: event.part, fresh, count });
        }
      }
    };
    // Every screen frame; and a 50 ms timer for when frames are paused or slowed (a page in a hidden
    // panel, some power-saving modes) while the sound plays on.
    let lastFrame = 0;
    const onFrame = () => {
      lastFrame = Date.now();
      step();
      frame = requestAnimationFrame(onFrame);
    };
    frame = requestAnimationFrame(onFrame);
    const fallback = setInterval(() => {
      if (Date.now() - lastFrame > 100) step();
    }, 50);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(fallback);
    };
  }, [player, pattern, bpm, playing]);

  return playing ? head : null;
}
