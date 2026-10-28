// One round of a voice or kīrtan game (docs/RHYTHM_PLAYGROUND.md §7.5, §7.7, §7.13, §7.14, §12.1; docs/DECISIONS.md
// #763): like the listening games' round (use-game-round.ts) — the published pack and the student's state, a seeded
// round from the engine, saved for progress, kept when the student leaves after doing something — but each challenge
// is "done" when the student says so, not when an answer is right. What a challenge records depends on its game:
// a self-check ("yes" / "not sure") is saved with no right or wrong (singing is judged by a person, never by the
// app, §12.1); Kīrtan Companion's entry tap is recognition (found within half a beat); Kīrtan Synchronization's taps
// give the round's timing, marked calibrated only on a tuned phone. The clips' signed links are made once per load.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { newRequestId } from '@/data/create-once';
import { playgroundAudioUrls } from '@/data/playground';
import { todayLocal } from '@/lib/dates';
import { reportDroppedChallenges } from '@/lib/playground/drop-report';
import { templateFor } from '@/lib/playground/eligibility';
import { generateRound, topStep } from '@/lib/playground/generator';
import { seenItems } from '@/lib/playground/repeat-guard';
import { roundSeed } from '@/lib/playground/rng';
import type { Challenge, GameId, GeneratedRound, PlayAsset, RoundItem, RoundTiming } from '@/lib/playground/types';
import { playedRound } from '@/lib/playground-games/round';

import { loadPlayground, saveRound, type PlaygroundLoad } from './playground-data';

export type PracticePhase = 'loading' | 'off' | 'empty' | 'ready' | 'playing' | 'summary';

/** What one challenge recorded: the answer key, right or wrong only for recognition (else left out). */
export type PracticeMark = { a?: string; ok?: boolean };

export function usePracticeRound(game: GameId) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [load, setLoad] = useState<PlaygroundLoad | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [round, setRound] = useState<GeneratedRound | null>(null);
  const [at, setAt] = useState(0);
  const [items, setItems] = useState<RoundItem[]>([]);
  const [replays, setReplays] = useState(0);
  const [finished, setFinished] = useState(false);
  const [timing, setTiming] = useState<RoundTiming | null>(null);
  const shownAt = useRef(0);
  const started = useRef<Date | null>(null);
  const saved = useRef(false);

  useEffect(() => {
    let live = true;
    void loadPlayground(profileId).then((loaded) => {
      if (!live) return;
      setLoad(loaded);
      // Signed links (1 hour) for this game's recorded clips; generated TEST sounds need none.
      const used = new Set((loaded.pack?.exercises ?? []).filter((e) => e.game === game).flatMap((e) => e.promptAssets));
      const paths = (loaded.pack?.assets ?? []).filter((a) => used.has(a.id) && a.path).map((a) => a.path as string);
      if (paths.length > 0) void playgroundAudioUrls(paths).then((found) => live && setUrls(found)).catch(() => undefined);
    });
    return () => {
      live = false;
    };
  }, [profileId, game]);

  const template = useMemo(() => (load?.pack && load.state ? templateFor(load.pack, game, load.state.levelId) : null), [load, game]);
  const steps = useMemo(() => Array.from({ length: topStep(template) }, (_, i) => i + 1), [template]);

  const phase: PracticePhase = !load
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

  const start = useCallback(
    (atStep?: number) => {
      if (!load?.pack || !load.state) return null;
      const s = atStep ?? step;
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
      if (made.dropped.length > 0) void reportDroppedChallenges(made.dropped, made.recipe.contentVersion);
      setStep(s);
      setRound(made);
      setAt(0);
      setItems([]);
      setReplays(0);
      setTiming(null);
      setFinished(false);
      shownAt.current = Date.now();
      started.current = new Date();
      saved.current = false;
      return made;
    },
    [load, step, game],
  );

  const challenge: Challenge | null = round?.challenges[at] ?? null;
  const marked = items.length > at;
  const last = round ? at >= round.challenges.length - 1 : true;

  /** Records the current challenge (again = replaces what it recorded). */
  const mark = useCallback(
    (m: PracticeMark) => {
      if (!challenge) return;
      const item: RoundItem = {
        e: challenge.exerciseId,
        r: challenge.revision,
        q: challenge.query,
        ...(m.a !== undefined ? { a: m.a } : {}),
        ...(m.ok !== undefined ? { ok: m.ok } : {}),
        rp: replays,
        ms: Math.max(0, Date.now() - shownAt.current),
        rv: challenge.review,
      };
      setItems((list) => [...list.slice(0, at), item]);
    },
    [challenge, replays, at],
  );

  const send = useCallback(
    (list: RoundItem[], finishedAt: Date | null, roundTiming: RoundTiming | null) => {
      if (!round || saved.current || list.length === 0 || !started.current) return;
      saved.current = true;
      const played = {
        ...playedRound({
          id: newRequestId(),
          round,
          startedAt: started.current,
          finishedAt,
          items: list,
          device: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
        }),
        timing: roundTiming,
      } as const;
      void saveRound(profileId, played).then((rounds) => setLoad((l) => (l ? { ...l, rounds, at: Date.now() } : l)));
    },
    [round, profileId],
  );

  const next = useCallback(() => {
    if (!round) return;
    if (last) {
      setFinished(true);
      send(items, new Date(), timing);
      return;
    }
    setAt((n) => n + 1);
    setReplays(0);
    shownAt.current = Date.now();
  }, [round, last, items, timing, send]);

  // Leaving mid-round keeps what was done (§6.1), as a left round.
  const leaving = useRef<() => void>(() => undefined);
  useEffect(() => {
    leaving.current = () => {
      if (round && !finished) send(items, null, timing);
    };
  }, [round, finished, items, timing, send]);
  useEffect(() => () => leaving.current(), []);

  /** A challenge's recorded clip or generated sound (the first prompt asset), with its signed link when it has a file. */
  const assetOf = useCallback(
    (c: Challenge | null): { asset: PlayAsset; url: string | null } | null => {
      const id = c?.prompt.assets[0];
      const asset = load?.pack?.assets.find((a) => a.id === id);
      return asset ? { asset, url: asset.path ? (urls[asset.path] ?? null) : null } : null;
    },
    [load, urls],
  );

  return {
    profileId,
    phase,
    load,
    steps,
    step,
    setStep,
    round,
    at,
    challenge,
    /** The current challenge has recorded something (Next is enabled). */
    marked,
    last,
    items,
    start,
    mark,
    next,
    replayed: () => setReplays((n) => n + 1),
    setTiming,
    assetOf,
    /** Generated TEST sounds or placeholder content (§19.3). */
    testSounds: Boolean(load?.pack?.placeholders) || Boolean(load?.pack?.assets.some((a) => a.bundledKey?.startsWith('synth:'))),
  };
}

export type PracticeRound = ReturnType<typeof usePracticeRound>;
