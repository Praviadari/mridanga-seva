// Echo me, call and response (docs/DECISIONS.md #472; research idea 4): the class's own way of teaching, the Guru
// plays and the student plays it back. The app plays one vibhag of a taal (the call), then leaves as long silent for
// the answer (soft clicks on its beats when wished), then the next vibhag, or the same one again (lib/echo.ts). The
// student answers on the drum or on the tap pads; pad answers are graded like the play-along and get stars per round,
// the best kept on this phone. With Record myself (components/record-myself.tsx) the drum answers are recorded with
// the calls and heard back against them; the takes stay on the phone (#283). Routes: student/echo-me.tsx,
// staff/echo-me.tsx.
//
// For students it is also Echo Challenge, a Rhythm Playground game (docs/RHYTHM_PLAYGROUND.md §7.3; #752): Rounds =
// calls from the approved exercise bank (2-8 beats), each answered in a window exactly as long as the call (after one
// silent cycle at the recall step), with or without soft clicks. Pad answers are graded on the order of the strokes
// (which pad, in turn) and, on a tuned phone, their timing; answers on the khol are the student's own check ("Did it
// sound the same?") and are not scored by the app. Free play is the call and response above.

import type { TFunction } from 'i18next';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { CycleStars, TaalChips, TapPads, TempoStepper, TuneLine } from '@/components/play-parts';
import { RecordMyself } from '@/components/record-myself';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchTaals, type Taal, type TaalList } from '@/data/practice';
import type { SoundId } from '@/lib/bols';
import { echoCall, echoPlace, echoPlan, gradeEcho, inAnswer, type EchoGrade } from '@/lib/echo';
import { applySoundChoice } from '@/lib/khol-samples';
import type { RecordingSetting } from '@/lib/my-recordings';
import { createPadSound, type PadSound } from '@/lib/pad-sound';
import { createPracticePlayer, type PracticePlayer } from '@/lib/practice-audio';
import { countInClicks, taalPattern } from '@/lib/practice-pattern';
import type { PadHand } from '@/lib/tap-grading';
import { usePlayhead } from '@/lib/use-playhead';
import { useTapGame } from '@/lib/use-tap-game';
import { BeatRow, RhythmFrame, TapLine } from '@/screens/playground/rhythm-parts';
import { useRhythmRound, type RhythmRound } from '@/screens/playground/use-rhythm-round';
import { oncePattern, useTimedRun } from '@/screens/playground/use-timed-run';
import { radius, spacing, useTheme } from '@/theme/use-theme';

type AnswerOn = 'drum' | 'pads';

/** The pad's sound for a tap near no stroke of the answer. */
const PLAIN_TAP: Record<PadHand, SoundId> = { left: 'ga', right: 'ta' };

/** Echo me. `rounds`: the student's Echo Challenge, with Playground rounds and the free call and response. */
export function EchoMe({ rounds = false }: { rounds?: boolean }) {
  const { t } = useTranslation();
  if (rounds) return <EchoGame />;
  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('echo.title') }} />
      <EchoMePlay />
    </Screen>
  );
}

type Tab = 'rounds' | 'free';

/** Echo Challenge: calls from the exercise bank, or the free call and response. */
function EchoGame() {
  const { t } = useTranslation();
  const game = useRhythmRound('echo');
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
  const [view, setView] = useState<Tab>('rounds');
  const [answerOn, setAnswerOn] = useState<AnswerOn>('pads');
  const roundsOn = game.phase !== 'off' && game.phase !== 'empty';
  const shown: Tab = roundsOn ? view : 'free';
  const top =
    roundsOn && game.phase !== 'playing' ? (
      <>
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
        {shown === 'rounds' ? (
          <ChoiceGroup<AnswerOn>
            segmented
            label={t('echo.answerOn')}
            value={answerOn}
            onChange={setAnswerOn}
            choices={[
              { value: 'pads', label: t('echo.onPads') },
              { value: 'drum', label: t('echo.onDrum') },
            ]}
          />
        ) : null}
      </>
    ) : null;
  return (
    <RhythmFrame
      game={game}
      title={t('playground.game.echo.name')}
      instructions={[t('playground.rhythm.echo.instructions'), t(answerOn === 'pads' ? 'playground.rhythm.echo.onPads' : 'playground.rhythm.echo.onKhol')]}
      icon="loop"
      top={top}
      onExit={() => player.stop()}
      replace={shown === 'free' ? <EchoMePlay /> : undefined}
    >
      {game.challenge ? (
        <EchoCallChallenge key={`${game.round?.recipe.seed}:${game.at}`} game={game} player={player} padSound={padSound} answerOn={answerOn} />
      ) : null}
    </RhythmFrame>
  );
}

/** One call: Start, listen, answer in the window of the same length, then how it went. */
function EchoCallChallenge({ game, player, padSound, answerOn }: { game: RhythmRound; player: PracticePlayer; padSound: PadSound; answerOn: AnswerOn }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const beats = useMemo(() => game.challenge?.prompt.beats ?? [], [game.challenge]);
  const bpm = game.challenge?.prompt.bpm ?? 60;
  const clicks = game.stepParams.clicks !== false;
  const delay = typeof game.stepParams.delay === 'number' ? game.stepParams.delay : game.stepParams.delay === true ? 1 : 0;
  const call = useMemo(() => echoCall(beats, clicks, delay), [beats, clicks, delay]);
  const timed = useTimedRun(player);
  const [grade, setGrade] = useState<EchoGrade | null>(null);
  const [heard, setHeard] = useState(false);

  const start = async () => {
    if (!call) return;
    setGrade(null);
    if (answerOn === 'pads') await padSound.prepare([...new Set([...call.answers.map((h) => h.sound), ...Object.values(PLAIN_TAP)])]);
    void timed.run(oncePattern(call.pattern), bpm, countInClicks('metronome', Math.min(4, beats.length), []), (taps) => {
      setHeard(true);
      if (answerOn !== 'pads') return;
      const g = gradeEcho(call, taps, bpm);
      setGrade(g);
      game.ran({ given: g.given || '-', ok: g.orderOk, errorsMs: g.errorsMs.filter((e): e is number => e !== null) });
    });
  };
  const hearCall = () => void player.playOnce(taalPattern([...beats]), bpm);
  const tapPad = (hand: PadHand) => {
    padSound.play(PLAIN_TAP[hand]);
    timed.tap(hand);
  };

  const beat = timed.beat;
  const place = beat === null || !call ? null : beat < call.length ? 'call' : inAnswer(call, beat) ? 'answer' : 'wait';
  const cells = beats.map((b) => (b === '-' ? '–' : b.replace(/\./g, ' ')));
  return (
    <>
      <AppText tone="muted">{t('playground.rhythm.tempo', { bpm })}</AppText>
      {timed.failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
      {!game.done && !(heard && answerOn === 'drum') ? (
        <Button size="large" icon={timed.running ? 'pause' : 'play'} label={t(timed.running ? 'practice.stop' : 'playground.rhythm.startRun')} onPress={timed.running ? timed.stop : () => void start()} />
      ) : null}
      {timed.running ? (
        <View
          style={[styles.now, { backgroundColor: place === 'answer' ? colors.primarySoft : colors.surfaceSunken, borderColor: place === 'answer' ? colors.accent : colors.cardBorder }]}
          accessible
          accessibilityLiveRegion="polite"
        >
          <AppText variant="title" style={styles.centre}>
            {place === null ? t('practice.countingIn') : place === 'call' ? t('echo.listen') : place === 'answer' ? t('echo.yourTurn') : t('playground.rhythm.echo.wait')}
          </AppText>
        </View>
      ) : null}
      <BeatRow cells={place === 'answer' || place === 'wait' ? cells.map(() => '•') : cells} current={place === 'call' && beat !== null ? beat : place === 'answer' && beat !== null && call ? beat - call.answerStart : null} />
      {answerOn === 'pads' && !game.done ? <TapPads onTap={tapPad} guide={{ left: null, right: null }} fresh={false} feedback={{ left: null, right: null }} /> : null}
      {grade ? (
        <View style={styles.result} accessible accessibilityLiveRegion="polite">
          <AppText variant="title">{t(grade.orderOk ? 'playground.rhythm.echo.sameOrder' : 'playground.rhythm.echo.notSameOrder')}</AppText>
          <AppText>{t('playground.rhythm.echo.hands', { call: handsText(grade.expected, t), you: grade.given ? handsText(grade.given, t) : '—' })}</AppText>
          {game.tuned ? <TapLine errorsMs={grade.errorsMs} /> : <AppText variant="small" tone="muted">{t('playground.rhythm.practiceOnly')}</AppText>}
          <Button variant="secondary" icon="listen" label={t('playground.rhythm.echo.hearCall')} onPress={hearCall} />
        </View>
      ) : null}
      {heard && answerOn === 'drum' && !game.done ? (
        <View style={styles.result}>
          <AppText variant="subtitle">{t('playground.rhythm.echo.sameQuestion')}</AppText>
          <Button variant="secondary" icon="listen" label={t('playground.rhythm.echo.hearCall')} onPress={hearCall} />
          <Button icon="tick" label={t('playground.rhythm.echo.selfYes')} onPress={() => game.ran({ given: 'self:yes', ok: null })} />
          <Button variant="secondary" label={t('playground.rhythm.echo.selfUnsure')} onPress={() => game.ran({ given: 'self:unsure', ok: null })} />
        </View>
      ) : null}
    </>
  );
}

/** "R L R" in words for the screen ("right right left"). */
function handsText(hands: string, t: TFunction): string {
  return hands
    .split(' ')
    .map((h) => (h === 'L' ? t('playground.rhythm.echo.left') : t('playground.rhythm.echo.right')))
    .join(' · ');
}
/** The free call and response (Free play for students; the whole screen for facilitators). */
function EchoMePlay() {
  const { t } = useTranslation();
  const { colors } = useTheme();
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
  const [vibhag, setVibhag] = useState<number | null>(null);
  const [clicks, setClicks] = useState(true);
  const [showBols, setShowBols] = useState(true);
  const [answerOn, setAnswerOn] = useState<AnswerOn>('drum');
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
    const tag = 'echo-me';
    activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [playing]);

  const taal = list?.taals.find((tl) => tl.id === taalId) ?? null;
  const plan = useMemo(() => (taal ? echoPlan(taal.bols, taal.divisions, vibhag, clicks) : null), [taal, vibhag, clicks]);
  const head = usePlayhead(player, playing && plan ? plan.pattern : null, bpm, playing, starts);
  const place = plan && head ? echoPlace(plan.segments, head.beat) : null;
  const segments = plan?.segments;
  const counts = useCallback((beat: number) => (segments ? echoPlace(segments, Math.floor(beat))?.phase === 'answer' : false), [segments]);

  const game = useTapGame({
    player,
    playing: playing && answerOn === 'pads',
    starts,
    hits: plan?.answers ?? [],
    beats: plan?.pattern.beats ?? 1,
    bpm,
    counts,
    bestKey: taal ? `echo:${taal.id}` : null,
    profileId,
    onTap: (hand, hit) => padSound.play(hit?.sound ?? PLAIN_TAP[hand]),
  });

  /** Starts the loop from beat 1, after `clicks` of count-in. */
  const startPlan = async (next: NonNullable<typeof plan>, nextBpm: number, countIn: number) => {
    player.stop();
    if (answerOn === 'pads') await padSound.prepare([...new Set([...next.answers.map((h) => h.sound), ...Object.values(PLAIN_TAP)])]);
    const ok = await player.start(next.pattern, nextBpm, countIn);
    setSoundFailed(!ok);
    if (!ok) return false;
    setStarts((n) => n + 1);
    setPlaying(true);
    return true;
  };

  const toggle = async () => {
    if (playing) {
      player.stop();
      setPlaying(false);
      return;
    }
    if (plan && taal) await startPlan(plan, bpm, countInClicks('taal', 4, taal.divisions));
  };

  const stopSound = () => {
    player.stop();
    setPlaying(false);
  };

  const recordSetting: RecordingSetting | null = taal
    ? { mode: 'echo', taalId: taal.id, taalName: taal.name, taalBpm: bpm, speed: 1, vibhag, clicks }
    : null;

  const startSoundOf = async (s: RecordingSetting) => {
    if (s.mode !== 'echo') return false;
    const found = list?.taals.find((tl) => tl.id === s.taalId);
    const again = found ? echoPlan(found.bols, found.divisions, s.vibhag, s.clicks) : null;
    if (!found || !again) return false;
    setTaalId(found.id);
    setBpm(s.taalBpm);
    setVibhag(s.vibhag);
    setClicks(s.clicks);
    return startPlan(again, s.taalBpm, 0);
  };

  const chooseTaal = (id: number) => {
    setTaalId(id);
    setVibhag(null);
  };

  return (
    <>
      <AppText tone="muted">{t('echo.intro')}</AppText>

      {soundFailed ? (
        <Notice tone="error" title={t('practice.soundFailedTitle')}>
          {t('practice.soundFailed')}
        </Notice>
      ) : null}

      <Section icon="reply" title={taal ? taal.name : t('echo.title')}>
        {list === undefined ? <LoadingCards /> : null}
        {list?.saved ? <Notice tone="info">{t('practice.savedTaals')}</Notice> : null}
        {list && list.taals.length === 0 ? <AppText tone="muted">{t('practice.noTaals')}</AppText> : null}
        {list && list.taals.length > 0 && !playing ? <TaalChips taals={list.taals} value={taalId} onChange={chooseTaal} /> : null}
        {taal && !playing ? <VibhagChoice taal={taal} value={vibhag} onChange={setVibhag} /> : null}
        <TempoStepper bpm={bpm} onChange={setBpm} disabled={playing} />
        <Button
          size="large"
          icon={playing ? 'pause' : 'play'}
          label={playing ? t('practice.stop') : t('practice.start')}
          disabled={!plan || tuning}
          onPress={() => void toggle()}
        />
        {playing && taal ? <EchoNow taal={taal} place={place} showBols={showBols} /> : null}
        {answerOn === 'pads' ? (
          <>
            <TapPads onTap={game.tap} guide={{ left: null, right: null }} fresh={false} feedback={game.feedback} />
            <CycleStars scores={game.scores} best={game.best} newBest={game.newBest} unit="round" />
          </>
        ) : null}
      </Section>

      <Section icon="settings" title={t('echo.howTitle')}>
        <ChoiceGroup<AnswerOn>
          segmented
          label={t('echo.answerOn')}
          value={answerOn}
          onChange={(next) => !playing && setAnswerOn(next)}
          choices={[
            { value: 'drum', label: t('echo.onDrum') },
            { value: 'pads', label: t('echo.onPads') },
          ]}
        />
        <Checkbox label={t('echo.clicks')} checked={clicks} onChange={(on) => !playing && setClicks(on)} />
        <Checkbox label={t('echo.showBols')} checked={showBols} onChange={setShowBols} />
        {answerOn === 'pads' ? <TuneLine player={player} busy={playing} onTuning={setTuning} /> : null}
      </Section>

      <View style={[styles.recordNote, { borderColor: colors.border }]}>
        <AppText variant="small" tone="muted">
          {t('echo.recordHint')}
        </AppText>
      </View>
      <RecordMyself kind="echo" setting={recordSetting} startSound={() => (plan ? startPlan(plan, bpm, 0) : Promise.resolve(false))} startSoundOf={startSoundOf} stopSound={stopSound} />
    </>
  );
}

/** All vibhags in turn, or one of them again and again. */
function VibhagChoice({ taal, value, onChange }: { taal: Taal; value: number | null; onChange: (v: number | null) => void }) {
  const { t } = useTranslation();
  const choices = [
    { value: -1, label: t('echo.allVibhags') },
    ...taal.divisions.map((beats, i) => ({ value: i, label: t('echo.vibhagChoice', { n: i + 1, mark: taal.marks[i] ?? '', beats }) })),
  ];
  return (
    <ChoiceGroup<number>
      chips
      label={t('echo.vibhag')}
      value={value ?? -1}
      onChange={(v) => onChange(v < 0 ? null : v)}
      choices={choices}
    />
  );
}

/** "Listen" or "Your turn", which vibhag, and its bols with the beat being heard marked. */
function EchoNow({ taal, place, showBols }: { taal: Taal; place: ReturnType<typeof echoPlace>; showBols: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!place) {
    return (
      <AppText variant="label" style={styles.centre}>
        {t('practice.countingIn')}
      </AppText>
    );
  }
  const { segment, phase, beat } = place;
  const answer = phase === 'answer';
  const beats = taal.bols.slice(segment.taalStart, segment.taalStart + segment.length);
  const hidden = answer && !showBols;
  return (
    <View
      style={[styles.now, { backgroundColor: answer ? colors.primarySoft : colors.surfaceSunken, borderColor: answer ? colors.accent : colors.cardBorder }]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t(answer ? 'echo.yourTurn' : 'echo.listen')} · ${t('echo.vibhagOf', { n: segment.vibhag + 1, of: taal.divisions.length || 1 })}`}
    >
      <AppText variant="title" style={[styles.centre, answer ? { color: colors.onPrimarySoft } : null]}>
        {t(answer ? 'echo.yourTurn' : 'echo.listen')}
      </AppText>
      <AppText variant="small" tone="muted" style={styles.centre}>
        {t('echo.vibhagOf', { n: segment.vibhag + 1, of: taal.divisions.length || 1 })}
      </AppText>
      <View style={styles.beats}>
        {beats.map((b, i) => (
          <View
            key={i}
            style={[styles.beat, { borderColor: i === beat ? colors.accent : colors.border, backgroundColor: i === beat ? colors.surface : 'transparent' }]}
          >
            <AppText variant="label" family="sans">
              {hidden ? '•' : b === '-' ? '–' : b.replace(/\./g, ' ')}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    textAlign: 'center',
  },
  now: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 2,
    borderRadius: radius,
  },
  beats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  beat: {
    minWidth: 48,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderWidth: 2,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  result: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  recordNote: {
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
});
