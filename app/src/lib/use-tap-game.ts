// The tap pads' game while a practice player loops (docs/DECISIONS.md #470, #472): each tap is read against the
// player's clock (lib/tap-grading.ts), moved by the phone's tuned delay, graded and shown on its pad; every finished
// cycle gets its stars, and a cycle better than the best kept on this phone becomes the new best (lib/play-bests.ts).
// Used by the tap-pad play-along and by Echo me.

import { useCallback, useEffect, useRef, useState } from 'react';

import { saveTapBest, tapBest, tapOffset, type TapBest } from './play-bests';
import type { PracticePlayer } from './practice-player';
import { BeatClock, correctedBeat, TapScorer, type CycleScore, type ExpectedHit, type PadHand, type TapGrade } from './tap-grading';

/** The last tap on a pad: its grade, and a count so the same grade twice shows twice. */
export type PadFeedback = { grade: TapGrade; n: number } | null;

/** Cycles' stars kept on the screen. */
const SHOWN_CYCLES = 8;

/** What the screen shows of the game. */
export type TapGame = {
  /** A tap on a pad: graded, and `onTap` told which stroke it was (null = none near). */
  tap: (hand: PadHand) => void;
  feedback: Record<PadHand, PadFeedback>;
  /** The last cycles, oldest first. */
  scores: CycleScore[];
  best: TapBest | null;
  /** The last cycle was a new best. */
  newBest: boolean;
};

/** Props of useTapGame. */
export type TapGameOptions = {
  player: PracticePlayer;
  playing: boolean;
  /** Counts the starts of the sound: a new start starts the game afresh. */
  starts: number;
  hits: readonly ExpectedHit[];
  /** Beats in the loop. */
  beats: number;
  bpm: number;
  /** Where in the loop a stray tap counts (Echo me: only while answering). */
  counts?: (beatInLoop: number) => boolean;
  /** Where the best is kept ("pad:<taal>", "echo:<taal>"); null = not kept. */
  bestKey: string | null;
  profileId: string;
  /** Each tap, with the stroke it was matched to: the pad's own sound plays here. */
  onTap?: (hand: PadHand, hit: ExpectedHit | null) => void;
};

/** The tap game of one screen. */
export function useTapGame({ player, playing, starts, hits, beats, bpm, counts, bestKey, profileId, onTap }: TapGameOptions): TapGame {
  const game = useRef<{ scorer: TapScorer; clock: BeatClock; offset: number } | null>(null);
  const countsRef = useRef(counts);
  const onTapRef = useRef(onTap);
  useEffect(() => {
    countsRef.current = counts;
    onTapRef.current = onTap;
  });
  const [feedback, setFeedback] = useState<Record<PadHand, PadFeedback>>({ left: null, right: null });
  const [scores, setScores] = useState<CycleScore[]>([]);
  const [newBest, setNewBest] = useState(false);
  // The best kept on the phone for this taal: read again when the taal (or the login) changes, set when a cycle beats it.
  // Kept in state: the React Compiler would keep a plain read of the phone's storage from the first render.
  const bestOf = `${profileId}|${bestKey ?? ''}`;
  const [best, setBest] = useState<{ of: string; value: TapBest | null }>(() => ({ of: bestOf, value: bestKey ? tapBest(profileId, bestKey) : null }));
  if (best.of !== bestOf) setBest({ of: bestOf, value: bestKey ? tapBest(profileId, bestKey) : null });

  // A new start begins afresh: no taps, no stars yet (set while rendering, as React advises for a changed prop).
  const [shownStart, setShownStart] = useState(starts);
  if (shownStart !== starts) {
    setShownStart(starts);
    setFeedback({ left: null, right: null });
    setScores([]);
    setNewBest(false);
  }
  useEffect(() => {
    game.current = playing && hits.length > 0
      ? { scorer: new TapScorer(hits, beats, (b) => countsRef.current?.(b) ?? true), clock: new BeatClock(beats), offset: tapOffset() }
      : null;
  }, [playing, starts, hits, beats]);

  // The cycles that are over get their stars (read often, so a phone's loop wrapping round is never missed).
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const g = game.current;
      const position = player.position();
      if (!g || !position) return;
      const done = g.scorer.close(correctedBeat(g.clock.next(position), g.offset, bpm), bpm);
      if (done.length === 0) return;
      setScores((list) => [...list, ...done].slice(-SHOWN_CYCLES));
      const last = done[done.length - 1];
      if (bestKey) {
        const next = { stars: last.stars, bpm: Math.round(bpm) };
        const better = saveTapBest(profileId, bestKey, next);
        setNewBest(better);
        if (better) setBest({ of: `${profileId}|${bestKey}`, value: next });
      }
    }, 50);
    return () => clearInterval(id);
  }, [playing, player, bpm, bestKey, profileId]);

  const tap = useCallback(
    (hand: PadHand) => {
      const g = game.current;
      const position = player.position();
      if (!g || !position) {
        // The count-in, or stopped: the pad still sounds, nothing is graded.
        onTapRef.current?.(hand, null);
        return;
      }
      const result = g.scorer.tap(hand, correctedBeat(g.clock.next(position), g.offset, bpm), bpm);
      onTapRef.current?.(hand, result.hit);
      setFeedback((f) => ({ ...f, [hand]: { grade: result.grade, n: (f[hand]?.n ?? 0) + 1 } }));
    },
    [player, bpm],
  );

  return { tap, feedback, scores, best: best.value, newBest };
}
