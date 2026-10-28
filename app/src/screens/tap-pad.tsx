// Tap pad, a play-along on the screen (docs/DECISIONS.md #470; research idea 2): practice away from the drum, on the
// bus or in a waiting room. The taal plays (after one vibhag of count-in) and the student taps each stroke on two big
// pads, the baya's on the left and the dayan's on the right; each tap is graded against the sound's own clock (on
// time, early or late) and every cycle gets 0-3 stars; the best cycle per taal is kept on this phone only. Or only the
// beat plays and the taps make the strokes' sounds. The pads light with the stroke when the guide is on, with the hand
// drawings of #404. "Tune to this phone" measures the phone's delay once. Nothing leaves the phone: no ranking, no
// scores for anyone else. Routes: student/tap-pad.tsx, staff/tap-pad.tsx.
//
// For students it is also Tap the Beat, a Rhythm Playground game (docs/RHYTHM_PLAYGROUND.md §7.2; #750): Rounds =
// pulse mode — clicks on every beat of 4 or 8 (an exercise of the bank), then quieter (only sam, silent cycles), the
// student taps every beat on one big pad; after each run "Steady" / "A little rushed" / "A little slow" from the
// middle tap error and a calm line of the taps, only on a tuned phone (otherwise practice only). The round is saved
// for the student's progress; Free play is the play-along above.

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { CycleStars, TaalChips, TapPads, TempoStepper, TuneLine } from '@/components/play-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchTaals, type TaalList } from '@/data/practice';
import type { SoundId } from '@/lib/bols';
import { applySoundChoice } from '@/lib/khol-samples';
import { createPadSound } from '@/lib/pad-sound';
import { createPracticePlayer, type PracticePlayer } from '@/lib/practice-audio';
import { countInClicks, metronomePattern, readTaal, taalPattern } from '@/lib/practice-pattern';
import { pulseRun } from '@/lib/playground-games/rhythm';
import { gradePulse, pulseKept, pulsesOf, taalHits, type PadHand, type PulseResult } from '@/lib/tap-grading';
import { usePlayhead } from '@/lib/use-playhead';
import { useTapGame } from '@/lib/use-tap-game';
import { BeatRow, BigTapPad, PulseResultView, RhythmFrame } from '@/screens/playground/rhythm-parts';
import { useRhythmRound, type RhythmRound } from '@/screens/playground/use-rhythm-round';
import { oncePattern, useTimedRun } from '@/screens/playground/use-timed-run';

/** What the loop plays: the taal itself, or only the beat (the taps make the strokes). */
type PlayMode = 'taal' | 'beat';

/** The pad's sound for a tap near no stroke: an open stroke of that hand. */
const PLAIN_TAP: Record<PadHand, SoundId> = { left: 'ga', right: 'ta' };

/** The tap pad. `rounds`: the student's Tap the Beat, with Playground rounds and the play-along as Free play. */
export function TapPad({ rounds = false }: { rounds?: boolean }) {
  const { t } = useTranslation();
  if (rounds) return <TapTheBeat />;
  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('tapPad.title') }} />
      <TapPadPlay />
    </Screen>
  );
}

type Tab = 'rounds' | 'free';

/** Tap the Beat: pulse rounds, or the play-along. */
function TapTheBeat() {
  const { t } = useTranslation();
  const game = useRhythmRound('tap_the_beat');
  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);
  useEffect(() => {
    void applySoundChoice();
  }, []);
  const [view, setView] = useState<Tab>('rounds');
  // Without the Playground (not on yet, or nothing for this level) the play-along is all there is.
  const roundsOn = game.phase !== 'off' && game.phase !== 'empty';
  const shown: Tab = roundsOn ? view : 'free';
  const choice = roundsOn && game.phase !== 'playing' ? (
    <ChoiceGroup<Tab>
      segmented
      label={t('playground.rhythm.view')}
      value={shown}
      onChange={setView}
      choices={[
        { value: 'rounds', label: t('playground.rhythm.rounds') },
        { value: 'free', label: t('playground.rhythm.freePlay') },
      ]}
    />
  ) : null;
  return (
    <RhythmFrame
      game={game}
      title={t('playground.game.tap_the_beat.name')}
      instructions={[t('playground.rhythm.tap.instructions'), t('playground.rhythm.tap.instructions2')]}
      icon="tap"
      top={choice}
      onExit={() => player.stop()}
      replace={shown === 'free' ? <TapPadPlay /> : undefined}
    >
      {game.challenge ? <PulseChallenge key={`${game.round?.recipe.seed}:${game.at}`} game={game} player={player} /> : null}
    </RhythmFrame>
  );
}

/** One pulse run: Start, count-in, tap every beat, the result. */
function PulseChallenge({ game, player }: { game: RhythmRound; player: PracticePlayer }) {
  const { t } = useTranslation();
  const challenge = game.challenge;
  const n = Math.max(1, challenge?.prompt.beats.length ?? 4);
  const bpm = challenge?.prompt.bpm ?? 70;
  const run = useMemo(() => pulseRun(n, game.stepParams), [n, game.stepParams]);
  const timed = useTimedRun(player);
  const [result, setResult] = useState<PulseResult | null>(null);

  useEffect(() => {
    if (!timed.running) return;
    const tag = 'tap-the-beat';
    activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [timed.running]);

  const start = () => {
    setResult(null);
    const loops = run.cycles / (1 + run.mute);
    void timed.run(oncePattern(run.pattern, loops), bpm, countInClicks('metronome', n, []), (taps) => {
      const graded = gradePulse(
        taps.map((tp) => tp.at),
        pulsesOf(n, run.cycles),
        bpm,
        game.relaxed,
      );
      setResult(graded);
      game.ran({
        given: `${graded.verdict ?? 'none'} ${graded.tapped}/${graded.expected}`,
        ok: pulseKept(graded, game.tuned),
        errorsMs: graded.errorsMs.filter((e): e is number => e !== null),
      });
    });
  };

  const beat = timed.beat;
  const cycleIndex = beat === null ? 0 : Math.floor(beat / n);
  const silent = run.mute > 0 && cycleIndex % (1 + run.mute) > 0;
  const dots = Array.from({ length: n }, (_, i) => String(i + 1));
  return (
    <>
      <AppText tone="muted">{t('playground.rhythm.tempo', { bpm })}</AppText>
      {timed.failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
      {!game.done ? (
        <Button size="large" icon={timed.running ? 'pause' : 'play'} label={t(timed.running ? 'practice.stop' : 'playground.rhythm.startRun')} onPress={timed.running ? timed.stop : start} />
      ) : null}
      {timed.running && beat === null ? <AppText variant="label">{t('practice.countingIn')}</AppText> : null}
      {timed.running && silent ? <AppText variant="label">{t('playground.rhythm.silent')}</AppText> : null}
      <BeatRow cells={dots} current={run.guide && beat !== null ? beat % n : null} sam={[0]} />
      {!game.done ? <BigTapPad onTap={timed.tap} label={t('playground.rhythm.tap.pad')} lit={run.guide && beat !== null && !silent} /> : null}
      {result ? <PulseResultView result={result} tuned={game.tuned} /> : null}
      {!game.tuned && !timed.running ? <TuneLine player={player} busy={timed.running} onTuning={() => undefined} /> : null}
    </>
  );
}

/** The play-along itself (Free play for students; the whole screen for facilitators). */
function TapPadPlay() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const [player] = useState(createPracticePlayer);
  const [padSound] = useState(createPadSound);
  useEffect(
    () => () => {
      player.dispose();
      padSound.dispose();
    },
    [player, padSound],
  );
  useEffect(() => {
    void applySoundChoice();
  }, []);

  const [list, setList] = useState<TaalList | undefined>(undefined);
  const [taalId, setTaalId] = useState<number | null>(null);
  const [bpm, setBpm] = useState(60);
  const [mode, setMode] = useState<PlayMode>('taal');
  const [guideOn, setGuideOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [starts, setStarts] = useState(0);
  const [soundFailed, setSoundFailed] = useState(false);
  const [tuning, setTuning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void fetchTaals().then((loaded) => {
        const usable = { ...loaded, taals: loaded.taals.filter((tl) => tl.active) };
        setList(usable);
        setTaalId((current) => (current !== null && usable.taals.some((tl) => tl.id === current) ? current : usable.taals[0]?.id ?? null));
      });
      return () => {
        player.stop();
        setPlaying(false);
      };
    }, [player]),
  );

  useEffect(() => {
    if (!playing) return;
    const tag = 'tap-pad';
    activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [playing]);

  const taal = list?.taals.find((tl) => tl.id === taalId) ?? null;
  const strokes = useMemo(() => (taal ? taalPattern(taal.bols) : null), [taal]);
  const hits = useMemo(() => (taal ? taalHits(taal.bols) : []), [taal]);
  const readBeats = useMemo(() => (taal ? readTaal(taal.bols) : []), [taal]);
  // The playhead follows the taal's strokes even when only the beat sounds: the guide lights the stroke due now.
  const head = usePlayhead(player, playing ? strokes : null, bpm, playing, starts);

  const game = useTapGame({
    player,
    playing,
    starts,
    hits,
    beats: taal?.beats ?? 1,
    bpm,
    bestKey: taal ? `pad:${taal.id}` : null,
    profileId,
    onTap: (hand, hit) => {
      if (mode === 'beat') padSound.play(hit?.sound ?? PLAIN_TAP[hand]);
    },
  });

  const bolNow = head && readBeats[head.beat]?.[0]?.text !== '-' ? readBeats[head.bolBeat]?.[head.part] ?? null : null;
  const guide = {
    left: guideOn ? bolNow?.strokes.find((s) => s.head === 'baya') ?? null : null,
    right: guideOn ? bolNow?.strokes.find((s) => s.head === 'dayan') ?? null : null,
  };

  const toggle = async () => {
    if (playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    if (!taal || !strokes) return;
    if (mode === 'beat') await padSound.prepare([...new Set([...hits.map((h) => h.sound), ...Object.values(PLAIN_TAP)])]);
    const ok = await player.start(mode === 'taal' ? strokes : metronomePattern(taal.beats), bpm, countInClicks('taal', 4, taal.divisions));
    setSoundFailed(!ok);
    if (!ok) return;
    setStarts((n) => n + 1);
    setPlaying(true);
  };

  return (
    <>
      <AppText tone="muted">{t('tapPad.intro')}</AppText>

      {soundFailed ? (
        <Notice tone="error" title={t('practice.soundFailedTitle')}>
          {t('practice.soundFailed')}
        </Notice>
      ) : null}

      <Section icon="tap" title={taal ? taal.name : t('tapPad.title')}>
        {list === undefined ? <LoadingCards /> : null}
        {list?.saved ? <Notice tone="info">{t('practice.savedTaals')}</Notice> : null}
        {list && list.taals.length === 0 ? <AppText tone="muted">{t('practice.noTaals')}</AppText> : null}
        {list && list.taals.length > 0 && !playing ? <TaalChips taals={list.taals} value={taalId} onChange={setTaalId} /> : null}
        <TempoStepper bpm={bpm} onChange={setBpm} disabled={playing} />
        <Button
          size="large"
          icon={playing ? 'pause' : 'play'}
          label={playing ? t('practice.stop') : t('practice.start')}
          disabled={!taal || tuning}
          onPress={() => void toggle()}
        />
        {playing && !head ? <AppText variant="label" style={{ textAlign: 'center' }}>{t('practice.countingIn')}</AppText> : null}
        <AppText variant="title" family="sans" style={{ textAlign: 'center' }} accessibilityLabel={t('practice.nowPlaying', { bol: bolNow?.text ?? '—' })}>
          {bolNow && guideOn ? bolNow.text : ' '}
        </AppText>
        <TapPads onTap={game.tap} guide={guide} fresh={head?.fresh ?? false} feedback={game.feedback} />
        <CycleStars scores={game.scores} best={game.best} newBest={game.newBest} unit="cycle" />
      </Section>

      <Section icon="settings" title={t('tapPad.howTitle')}>
        <ChoiceGroup<PlayMode>
          label={t('tapPad.mode')}
          value={mode}
          onChange={(next) => !playing && setMode(next)}
          choices={[
            { value: 'taal', label: t('tapPad.modeTaal') },
            { value: 'beat', label: t('tapPad.modeBeat') },
          ]}
        />
        <Checkbox label={t('tapPad.guide')} checked={guideOn} onChange={setGuideOn} />
        <AppText variant="small" tone="muted">
          {t('tapPad.grading')}
        </AppText>
        <TuneLine player={player} busy={playing} onTuning={setTuning} />
      </Section>
    </>
  );
}
