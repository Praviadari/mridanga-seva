// One timed run of a rhythm game (docs/DECISIONS.md #750): after a count-in, a pattern plays once through on the
// practice player (its loop holds the whole run and one quiet beat more, so nothing sounds again after the end), the
// beat being heard is shown, and every tap is read on the player's own clock (never a JavaScript timer), moved back
// by the phone's tuned delay, as the tap pad does (lib/tap-grading.ts). Half a beat after the last beat the sound
// stops and the taps go to the game to grade.

import { useCallback, useEffect, useRef, useState } from 'react';

import { tapOffset } from '@/lib/play-bests';
import type { Pattern, PatternEvent } from '@/lib/practice-pattern';
import type { PracticePlayer } from '@/lib/practice-player';
import { BeatClock, correctedBeat, type PadHand } from '@/lib/tap-grading';

/** A tap of a run: the pad and the beat (absolute, from the run's start). */
export type RunTap = { hand: PadHand; at: number };

/** The whole run as one pattern: `loops` times `pattern`, and one quiet beat. */
export function oncePattern(pattern: Pattern, loops = 1): { pattern: Pattern; beats: number } {
  const n = Math.max(1, Math.round(loops));
  const events: PatternEvent[] = [];
  for (let i = 0; i < n; i++) for (const e of pattern.events) events.push({ ...e, at: e.at + i * pattern.beats });
  const beats = pattern.beats * n;
  return { pattern: { beats: beats + 1, events, key: `${pattern.key}:once${n}` }, beats };
}

type Live = { clock: BeatClock; offset: number; bpm: number; beats: number; taps: RunTap[]; onEnd: (taps: RunTap[]) => void };

/** The run's state and its actions. */
export function useTimedRun(player: PracticePlayer) {
  const live = useRef<Live | null>(null);
  const [running, setRunning] = useState(false);
  /** The beat being heard (absolute, whole), or null during the count-in or when stopped. */
  const [beat, setBeat] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const stop = useCallback(() => {
    live.current = null;
    player.stop();
    setRunning(false);
    setBeat(null);
  }, [player]);

  /** Plays `pattern` once (its `beats`, without the quiet one) after `countIn` clicks; `onEnd` gets the taps. */
  const run = useCallback(
    async (once: { pattern: Pattern; beats: number }, bpm: number, countIn: number, onEnd: (taps: RunTap[]) => void) => {
      stop();
      const ok = await player.start(once.pattern, bpm, countIn);
      setFailed(!ok);
      if (!ok) return false;
      live.current = { clock: new BeatClock(once.pattern.beats), offset: tapOffset(), bpm, beats: once.beats, taps: [], onEnd };
      setRunning(true);
      return true;
    },
    [player, stop],
  );

  // Leaving the challenge (Next, Exit) mid-run stops the sound.
  useEffect(
    () => () => {
      if (live.current) player.stop();
      live.current = null;
    },
    [player],
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const g = live.current;
      const position = player.position();
      if (!g || !position) return;
      const at = g.clock.next(position);
      setBeat((b) => (Math.floor(at) === b ? b : Math.floor(at)));
      if (at >= g.beats + 0.5) {
        const { taps, onEnd } = g;
        stop();
        onEnd(taps);
      }
    }, 40);
    return () => clearInterval(id);
  }, [running, player, stop]);

  const tap = useCallback(
    (hand: PadHand) => {
      const g = live.current;
      const position = player.position();
      if (!g || !position) return;
      g.taps.push({ hand, at: correctedBeat(g.clock.next(position), g.offset, g.bpm) });
    },
    [player],
  );

  return { run, stop, tap, running, beat, failed };
}
