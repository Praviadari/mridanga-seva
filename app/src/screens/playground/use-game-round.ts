// One listening game's round on a screen (docs/RHYTHM_PLAYGROUND.md §6.1 game flow, §8.4, §8.8; docs/DECISIONS.md
// #736): loads the published pack and the student's state (the copy on the phone first, so it works offline), offers
// the steps the adaptive rules allow, asks the engine for a seeded round, counts tries, replays and time per
// challenge, and when the round ends (or the student leaves after answering something) queues it for record_round.
// Nothing sounds until the student taps Start; the answered items are kept if the student leaves mid-round.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { newRequestId } from '@/data/create-once';
import { todayLocal } from '@/lib/dates';
import { realSoundsReady } from '@/lib/khol-samples';
import { stepAdvice, stepLimits } from '@/lib/playground/adaptive';
import { isRight } from '@/lib/playground/check';
import { generateRound, topStep } from '@/lib/playground/generator';
import { templateFor } from '@/lib/playground/eligibility';
import { bolIndex } from '@/lib/playground/notation';
import { seenItems } from '@/lib/playground/repeat-guard';
import { roundSeed } from '@/lib/playground/rng';
import type { Challenge, GameId, GeneratedRound, PlayedRound, RoundItem, StepAdvice } from '@/lib/playground/types';
import { playedRound, pickOutcome, savedItem, summarise, TRIES, type PickOutcome, type RoundSummary } from '@/lib/playground-games/round';

import { loadPlayground, saveRound, type PlaygroundLoad } from './playground-data';

/** Where the screen is. */
export type RoundPhase = 'loading' | 'off' | 'empty' | 'ready' | 'playing' | 'summary';

/** The current challenge's state: picks made, the last outcome, done when right or shown. */
type Current = { tries: number; outcome: PickOutcome | null; replays: number; shownAt: number; first: string | null; firstOk: boolean };

const freshCurrent = (): Current => ({ tries: 0, outcome: null, replays: 0, shownAt: Date.now(), first: null, firstOk: false });

/** The round state and its actions for one game. */
export function useGameRound(game: GameId) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [load, setLoad] = useState<PlaygroundLoad | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [round, setRound] = useState<GeneratedRound | null>(null);
  const [at, setAt] = useState(0);
  const [current, setCurrent] = useState<Current>(freshCurrent);
  const [items, setItems] = useState<RoundItem[]>([]);
  const [mixed, setMixed] = useState<(readonly [string, string])[]>([]);
  const [finished, setFinished] = useState(false);
  const started = useRef<Date | null>(null);
  const saved = useRef(false);

  useEffect(() => {
    let live = true;
    void loadPlayground(profileId).then((loaded) => {
      if (live) setLoad(loaded);
    });
    return () => {
      live = false;
    };
  }, [profileId]);

  const index = useMemo(() => bolIndex(load?.pack?.bols ?? []), [load]);
  const template = useMemo(
    () => (load?.pack && load.state ? templateFor(load.pack, game, load.state.levelId) : null),
    [load, game],
  );
  const advice: StepAdvice | null = useMemo(() => {
    if (!load?.state || !template) return null;
    const rounds = load.rounds.filter((r) => r.game === game);
    const assignment = load.state.assignments.find((a) => a.game === game) ?? null;
    return stepAdvice({
      rounds,
      topStep: topStep(template),
      limits: stepLimits(load.state.settings.steps[game], assignment),
      now: load.at,
    });
  }, [load, template, game]);
  const chosenStep = step ?? advice?.step ?? 1;

  const phase: RoundPhase = !load
    ? 'loading'
    : !load.pack || !load.state
      ? 'off'
      : !template
        ? 'empty'
        : finished
          ? 'summary'
          : round
            ? 'playing'
            : 'ready';

  /** A new round at the chosen step (or `atStep`); nothing sounds until the game plays its first prompt. */
  const start = useCallback(
    (atStep?: number) => {
      if (!load?.pack || !load.state) return null;
      const s = atStep ?? chosenStep;
      const today = todayLocal();
      const todays = load.rounds.filter((r) => r.game === game && r.startedAt.slice(0, 10) === today).length;
      const made = generateRound({
        pack: load.pack,
        levelId: load.state.levelId,
        levelUpOk: load.state.settings.levelUpOk,
        ticked: load.state.ticked,
        game,
        step: s,
        seed: roundSeed(load.state.studentId, game, today, todays + 1),
        mode: 'play',
        seen: seenItems(load.rounds),
        now: Date.now(),
      });
      setStep(s);
      setRound(made);
      setAt(0);
      setItems([]);
      setMixed([]);
      setFinished(false);
      setCurrent(freshCurrent());
      started.current = new Date();
      saved.current = false;
      return made;
    },
    [load, chosenStep, game],
  );

  const challenge: Challenge | null = round?.challenges[at] ?? null;

  /** The student heard the prompt again: counted, as more replays = less sure (never "worse"). */
  const replayed = useCallback(() => setCurrent((c) => (c.outcome === 'right' || c.outcome === 'shown' ? c : { ...c, replays: c.replays + 1 })), []);

  /**
   * A pick. `given` is an answer key; `shown` the way the cards write the answer and the pick, for the summary's
   * "close" pairs. Returns the outcome, or null when the challenge is already done.
   */
  const answer = useCallback(
    (given: string, shown?: readonly [string, string]): PickOutcome | null => {
      if (!challenge || current.outcome === 'right' || current.outcome === 'shown') return null;
      const right = isRight(challenge.game, challenge.answer, given, index);
      const tries = current.tries + 1;
      const outcome = pickOutcome(tries, right);
      const first = current.first ?? given;
      const firstOk = tries === 1 ? right : current.firstOk;
      setCurrent({ ...current, tries, outcome, first, firstOk });
      if (tries === 1 && !right && shown) setMixed((m) => [...m, shown]);
      if (outcome !== 'again') {
        const item = savedItem(challenge, { given: first, ok: firstOk, tries, replays: current.replays, ms: Date.now() - current.shownAt });
        setItems((list) => [...list, item]);
      }
      return outcome;
    },
    [challenge, current, index],
  );

  const done = current.outcome === 'right' || current.outcome === 'shown';
  const last = round ? at >= round.challenges.length - 1 : true;

  const send = useCallback(
    (list: RoundItem[], finishedAt: Date | null) => {
      if (!round || saved.current || list.length === 0 || !started.current) return;
      saved.current = true;
      const played: PlayedRound = playedRound({
        id: newRequestId(),
        round,
        startedAt: started.current,
        finishedAt,
        items: list,
        device: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
      });
      void saveRound(profileId, played).then((rounds) => {
        setLoad((l) => (l ? { ...l, rounds, at: Date.now() } : l));
      });
    },
    [round, profileId],
  );

  /** The next challenge, or the summary after the last. */
  const next = useCallback(() => {
    if (!round || !done) return;
    if (last) {
      setFinished(true);
      send(items, new Date());
      return;
    }
    setAt((n) => n + 1);
    setCurrent(freshCurrent());
  }, [round, done, last, items, send]);

  // Leaving mid-round keeps what was answered (§6.1): the round is queued as left, unfinished.
  const leaving = useRef<() => void>(() => undefined);
  useEffect(() => {
    leaving.current = () => {
      if (round && !finished) send(items, null);
    };
  }, [round, finished, items, send]);
  useEffect(() => () => leaving.current(), []);

  const summary: RoundSummary | null = finished ? summarise(items, mixed) : null;

  return {
    phase,
    load,
    index,
    advice,
    step: chosenStep,
    setStep,
    round,
    at,
    challenge,
    tries: current.tries,
    outcome: current.outcome,
    triesLeft: Math.max(0, TRIES - current.tries),
    done,
    last,
    summary,
    start,
    replayed,
    answer,
    next,
    /** No recording is approved and bundled yet: the app's synthesised strokes play (§19.3). */
    testSounds: !realSoundsReady() || Boolean(load?.pack?.placeholders),
  };
}

/** What a game screen gets from useGameRound. */
export type GameRound = ReturnType<typeof useGameRound>;
