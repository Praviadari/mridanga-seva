// One rhythm game's round on a screen (docs/RHYTHM_PLAYGROUND.md §7.2, §7.3, §7.11, §7.12; docs/DECISIONS.md #750):
// as the listening games' hook (use-game-round.ts, #736) — the pack and the student's state (the phone's copy first),
// the steps the adaptive rules allow, a seeded round from the engine, the round queued for record_round when it ends
// or when the student leaves after answering something — but a challenge is answered by a pick (two tries, as the
// listening games) or by a run of taps. Tap runs are graded on the phone; their timing goes with the round
// (median and spread of the tap errors, and whether the phone was tuned: only then is it evidence, §12.1).
// Opened from the Daily Sādhana Quest or Surprise me (`?mode=daily|surprise&len=N`) the round is saved with that mode
// and holds N challenges.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { newRequestId } from '@/data/create-once';
import { todayLocal } from '@/lib/dates';
import { realSoundsReady } from '@/lib/khol-samples';
import { tapOffset, tapTuned } from '@/lib/play-bests';
import { stepAdvice, stepLimits } from '@/lib/playground/adaptive';
import { reportDroppedChallenges } from '@/lib/playground/drop-report';
import { allowedGuna, templateFor } from '@/lib/playground/eligibility';
import { generateRound, stepOf, topStep } from '@/lib/playground/generator';
import { seenItems } from '@/lib/playground/repeat-guard';
import { roundSeed } from '@/lib/playground/rng';
import type { Challenge, GameId, GeneratedRound, PlayExercise, RoundItem, StepAdvice, TemplateStep } from '@/lib/playground/types';
import { pickOutcome, playedRound, TRIES, type PickOutcome } from '@/lib/playground-games/round';
import { errorSummary } from '@/lib/tap-grading';

import { loadPlayground, saveRound, type PlaygroundLoad } from './playground-data';
import { useRoundParams } from './round-params';

export type RhythmPhase = 'loading' | 'off' | 'empty' | 'ready' | 'playing' | 'summary';

/** How a challenge was answered, for the item saved. */
export type RhythmAnswer = {
  /** The answer given, as a short key ("3", "R L R R", "steady"). */
  given: string;
  /** Right / kept; null = not judged (a phone not tuned, an answer on the khol). */
  ok: boolean | null;
  /** Tap errors of a run, ms, for the round's timing. */
  errorsMs?: readonly number[];
};

/** The round state and its actions for one rhythm game. */
export function useRhythmRound(game: GameId) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const { mode, len } = useRoundParams();
  const [load, setLoad] = useState<PlaygroundLoad | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [round, setRound] = useState<GeneratedRound | null>(null);
  const [at, setAt] = useState(0);
  const [tries, setTries] = useState(0);
  const [outcome, setOutcome] = useState<PickOutcome | 'ran' | null>(null);
  const [shownAt, setShownAt] = useState(0);
  const [items, setItems] = useState<RoundItem[]>([]);
  const [errors, setErrors] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  // Read again at each start and challenge: the student may tune the phone in between.
  const [tuned, setTuned] = useState(tapTuned);
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

  const template = useMemo(() => (load?.pack && load.state ? templateFor(load.pack, game, load.state.levelId) : null), [load, game]);
  const advice: StepAdvice | null = useMemo(() => {
    if (!load?.state || !template) return null;
    const assignment = load.state.assignments.find((a) => a.game === game) ?? null;
    return stepAdvice({
      rounds: load.rounds.filter((r) => r.game === game),
      topStep: topStep(template),
      limits: stepLimits(load.state.settings.steps[game], assignment),
      now: load.at,
    });
  }, [load, template, game]);
  const chosenStep = step ?? advice?.step ?? 1;

  const phase: RhythmPhase = !load ? 'loading' : !load.pack || !load.state ? 'off' : !template ? 'empty' : finished ? 'summary' : round ? 'playing' : 'ready';

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
        mode,
        seen: seenItems(load.rounds),
        now: Date.now(),
        roundLen: len,
      });
      if (made.dropped.length > 0) void reportDroppedChallenges(made.dropped, made.recipe.contentVersion);
      setStep(s);
      setRound(made);
      setAt(0);
      setTries(0);
      setOutcome(null);
      setShownAt(Date.now());
      setItems([]);
      setErrors([]);
      setFinished(false);
      setTuned(tapTuned());
      started.current = new Date();
      saved.current = false;
      return made;
    },
    [load, chosenStep, game, mode, len],
  );

  const challenge: Challenge | null = round?.challenges[at] ?? null;
  const exercise: PlayExercise | null = useMemo(
    () => (challenge && load?.pack ? load.pack.exercises.find((e) => e.id === challenge.exerciseId) ?? null : null),
    [challenge, load],
  );
  /** The step's parameters (template steps: ask, grid, mute, cycles, cue ...). */
  const stepParams: TemplateStep = useMemo(() => stepOf(template, round?.recipe.step ?? chosenStep), [template, round, chosenStep]);
  /** The guna this challenge may use at the student's level (exercise list narrowed by the template, D3). */
  const guna = useMemo(
    () => (exercise && load?.state ? allowedGuna(exercise, template, load.state.levelId) : [1]),
    [exercise, template, load],
  );

  const keep = useCallback(
    (answer: RhythmAnswer, triesUsed: number) => {
      if (!challenge) return;
      const item: RoundItem = {
        e: challenge.exerciseId,
        r: challenge.revision,
        q: challenge.query,
        a: answer.given.slice(0, 300),
        ...(answer.ok === null ? {} : { ok: answer.ok }),
        ms: Math.max(0, Math.round(Date.now() - shownAt)),
        rv: challenge.review,
        tr: triesUsed,
      };
      setItems((list) => [...list, item]);
      if (answer.errorsMs?.length) setErrors((list) => [...list, ...(answer.errorsMs ?? [])]);
    },
    [challenge, shownAt],
  );

  /** A pick (two tries, as the listening games); the first pick is what counts. */
  const first = useRef<string | null>(null);
  const firstOk = useRef(false);
  const pick = useCallback(
    (given: string, right: boolean): PickOutcome | null => {
      if (!challenge || outcome === 'right' || outcome === 'shown' || outcome === 'ran') return null;
      const n = tries + 1;
      const result = pickOutcome(n, right);
      if (n === 1) {
        first.current = given;
        firstOk.current = right;
      }
      setTries(n);
      setOutcome(result);
      if (result !== 'again') keep({ given: first.current ?? given, ok: firstOk.current }, n);
      return result;
    },
    [challenge, outcome, tries, keep],
  );
  const retry = useCallback(() => setOutcome((o) => (o === 'again' ? null : o)), []);

  /** A tap run (or a khol answer) finished: kept as the challenge's answer. */
  const ran = useCallback(
    (answer: RhythmAnswer) => {
      if (!challenge || outcome === 'ran') return;
      setOutcome('ran');
      setTries(1);
      keep(answer, 1);
    },
    [challenge, outcome, keep],
  );

  const done = outcome === 'right' || outcome === 'shown' || outcome === 'ran';
  const last = round ? at >= round.challenges.length - 1 : true;

  const send = useCallback(
    (list: RoundItem[], errs: number[], finishedAt: Date | null) => {
      if (!round || saved.current || list.length === 0 || !started.current) return;
      saved.current = true;
      const summary = errorSummary(errs);
      const played = {
        ...playedRound({
          id: newRequestId(),
          round,
          startedAt: started.current,
          finishedAt,
          items: list,
          device: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
        }),
        timing: summary ? { medianMs: summary.medianMs, spreadMs: summary.spreadMs, calibrated: tuned, ...(tuned ? { offsetMs: tapOffset() } : {}) } : null,
      };
      void saveRound(profileId, played).then((rounds) => setLoad((l) => (l ? { ...l, rounds, at: Date.now() } : l)));
    },
    [round, profileId, tuned],
  );

  const next = useCallback(() => {
    if (!round || !done) return;
    if (last) {
      setFinished(true);
      send(items, errors, new Date());
      return;
    }
    setAt((n) => n + 1);
    setTries(0);
    setOutcome(null);
    setShownAt(Date.now());
    setTuned(tapTuned());
    first.current = null;
    firstOk.current = false;
  }, [round, done, last, items, errors, send]);

  // Leaving mid-round keeps what was answered (§6.1).
  const leaving = useRef<() => void>(() => undefined);
  useEffect(() => {
    leaving.current = () => {
      if (round && !finished) send(items, errors, null);
    };
  }, [round, finished, items, errors, send]);
  useEffect(() => () => leaving.current(), []);

  const marked = items.filter((i) => typeof i.ok === 'boolean');
  return {
    profileId,
    mode,
    phase,
    load,
    template,
    advice,
    step: chosenStep,
    setStep,
    stepParams,
    round,
    at,
    challenge,
    exercise,
    guna,
    tries,
    outcome,
    triesLeft: Math.max(0, TRIES - tries),
    done,
    last,
    items,
    /** Right / kept of the challenges judged, and how many were judged. */
    summary: finished ? { right: marked.filter((i) => i.ok).length, judged: marked.length, total: items.length } : null,
    /** The phone was tuned ("Tune to this phone"): only then is tap timing shown and counted. */
    tuned,
    relaxed: Boolean(load?.state?.settings.relaxedTiming),
    start,
    pick,
    retry,
    ran,
    next,
    testSounds: !realSoundsReady() || Boolean(load?.pack?.placeholders),
  };
}

export type RhythmRound = ReturnType<typeof useRhythmRound>;
