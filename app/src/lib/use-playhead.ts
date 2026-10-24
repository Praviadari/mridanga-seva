// Follows a practice player (lib/practice-player.ts) on every screen frame and says which beat and
// which bol are being heard, so the beat dots, the beat grid and the two-head view light up in time
// with the sound. The screen re-renders only when that changes (a few times a beat), not 60 times
// a second.

import { useEffect, useRef, useState } from 'react';

import { cycleAt, cyclesPassed, cyclesPerLoop, type Pattern } from './practice-pattern';
import type { PlayerPosition, PracticePlayer } from './practice-player';

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
  /** Cycles completed since beat 1 (after any count-in): the cycle counter and the speed trainer's clock (#403). */
  cycles: number;
  /** A silent cycle is heard now (#490): the student keeps the taal going alone. */
  silent: boolean;
};

/** How long a stroke stays bright, seconds (shorter at fast tempos). */
const FRESH_SECONDS = 0.16;

/**
 * The playhead of `player` while `playing`, or null. `starts` counts the screen's starts of the sound: a new start
 * (also of the same pattern while playing, e.g. Record myself) counts the cycles from 0 again.
 */
export function usePlayhead(player: PracticePlayer, pattern: Pattern | null, bpm: number, playing: boolean, starts = 0): Playhead | null {
  const [head, setHead] = useState<Playhead | null>(null);
  // Cycles count on across tempo changes (the speed trainer makes them); a new pattern or a new start counts from 0.
  const counter = useRef<{ lastAt: PlayerPosition | null; cycles: number }>({ lastAt: null, cycles: 0 });
  useEffect(() => {
    counter.current = { lastAt: null, cycles: 0 };
  }, [player, pattern, playing, starts]);

  useEffect(() => {
    if (!playing || !pattern) return;
    const strokes = pattern.events.filter((e) => !e.layer);
    if (strokes.length === 0) return;
    let frame = 0;
    let lastKey = '';
    const step = () => {
      const at = player.position();
      if (at) {
        // The loop may hold several taal cycles (silent cycles, #490): count and show taal cycles.
        counter.current.cycles += cyclesPassed(counter.current.lastAt, at, pattern.beats);
        counter.current.lastAt = at;
        const where = cycleAt(pattern, at.beat);
        const cycles = counter.current.cycles * cyclesPerLoop(pattern) + where.cycleInLoop;
        // The last bol that has started: events are sorted by `at`; a layer (the kartal) is not a bol.
        let index = -1;
        for (let i = 0; i < strokes.length; i++) {
          if (strokes[i].at <= at.beat + 1e-6) index = i;
          else break;
        }
        // Before the first bol of a cycle: still the last bol of the previous cycle.
        const cycle = index === -1 ? at.cycle - 1 : at.cycle;
        const event = strokes[index === -1 ? strokes.length - 1 : index];
        const since = ((at.beat - event.at + (index === -1 ? pattern.beats : 0)) * 60) / bpm;
        const fresh = !where.silent && since < Math.min(FRESH_SECONDS, (0.6 * 60) / bpm);
        const count = cycle * strokes.length + (index === -1 ? strokes.length - 1 : index);
        const cycleBeats = pattern.silent?.cycleBeats ?? pattern.beats;
        const beat = Math.min(cycleBeats - 1, Math.floor(where.beat));
        const key = `${count}:${fresh}:${beat}:${cycles}:${where.silent}`;
        if (key !== lastKey) {
          lastKey = key;
          setHead({ beat, bolBeat: event.beat, part: event.part, fresh, count, cycles, silent: where.silent });
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
