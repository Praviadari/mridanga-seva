// S5 Practice tools (Phase 2 slice 3, docs/DECISIONS.md #54), for students (route
// student/practice.tsx) and staff (staff/practice.tsx):
// - Metronome: 30-240 beats a minute, tap tempo, beats in a bar with an accent on beat 1, a row of
//   beat dots lit in time.
// - Taal player: loops a taal (table taals; offline from the copy on the phone) at any tempo with a
//   slow-down of 50 %, 75 % or 100 %, the beat-name grid (vibhags with X / 2 / 0 marks) and the
//   two-head view V1 (components/two-head-view.tsx) lit in time with the sound.
// - Record myself (slice 4, components/record-myself.tsx): record one's own playing with the
//   metronome or taal started from its first beat, keep it on the phone, play it back beside the sound.
// - Practice timer (students, and Me > Practice of a staff member's own record, 0053 #319): starts with the first
//   sound or by hand, logs itself on Stop when it ran at least a minute (S6; lib/practice-timer.ts,
//   data/practice.ts). One slim line at the top, so the tempo and its big Start come on the first screen (#384).
//   Me > Practice also shows the student parts below (the week's plan, the goal, the reminder) for the own record.
// Sound: lib/practice-audio(.web).ts; timing is kept by the audio clock, not by JavaScript timers.
// The Guru sees "Edit taals" (staff/taals). The sound stops when the screen is left.
// More practice (docs/DECISIONS.md #400-#405; components/practice-more.tsx):
// - Mantra before practice (everyone): one tap at the top to the mantra reader, once the Guru added one.
// - Practice of the week (students): what the teachers set for the student's level, each taal with Start at its
//   tempo, each lesson with Watch, above the tools; staff open the editor (staff/practice-plan).
// - Count-in (one bar of clicks before beat 1), the cycle counter with stop after N, and the speed trainer (faster
//   step by step while it plays, up to a top tempo), on the metronome and the taal player.
// - Hands (taal player): which hand plays each beat in the grid, the hands under the two heads, and a step mode that
//   shows the strokes one at a time with Hear it.
// - The screen stays on while the sound plays.
// - This week against the weekly goal (students; their own goal or the class's), and the daily practice reminder
//   (Android app).
// Play and learn (#470-#474; components/play-and-learn.tsx): tiles to the tap pad, Which bol?, Echo me and Learn more.
// Practice extras (#490-#495; components/practice-extras.tsx, practice-feeling.tsx):
// - Silent bars / cycles (metronome and taal player): play N, then M without sound, round again; the beat stays lit.
// - Layakari (taal player): dugun, tigun, chaugun: 2, 3 or 4 written beats in each beat, shown in the grid.
// - Kartal under the taal, with its own volume.
// - "How did it go?" under the timer after Stop and save (students): three faces and what was practised; Skip.
// - Staff: Practice this week, per student, least first (staff/practice-week).

import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BeatGrid } from '@/components/beat-grid';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { RecordMyself } from '@/components/record-myself';
import {
  CycleNow,
  GoalFold,
  MantraEntry,
  PlanSection,
  ReminderFold,
  SpeedTrainerFields,
  StepControls,
  StopAfterChoice,
} from '@/components/practice-more';
import { PlayAndLearn } from '@/components/play-and-learn';
import { KartalFields, LayaChoice, SilentFields, type SilentSetting } from '@/components/practice-extras';
import { FeelingPrompt } from '@/components/practice-feeling';
import { GoalWeekView, practiceTime } from '@/components/practice-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TwoHeadView } from '@/components/two-head-view';
import {
  fetchMyPracticePlan,
  fetchPracticeDays,
  fetchTaals,
  logPractice,
  type MyPracticePlan,
  type PracticeDays,
  type Practised,
  type Taal,
  type TaalList,
} from '@/data/practice';
import { fetchCanEdit } from '@/data/ishtagoshti';
import { fetchMantras, savedMantras, type Mantra } from '@/data/mantras';
import { levelName } from '@/i18n/labels';
import type { RecordingSetting } from '@/lib/my-recordings';
import { createPracticePlayer } from '@/lib/practice-audio';
import {
  bolPattern,
  clampBpm,
  countInClicks,
  effectiveBpm,
  layaBeats,
  metronomePattern,
  silentFits,
  tapTempo,
  taalPattern,
  taalSteps,
  trainerTempo,
  withKartal,
  withSilentCycles,
  MAX_BPM,
  MIN_BPM,
  type Laya,
  type Pattern,
  type SpeedTrainer,
} from '@/lib/practice-pattern';
import { notePractisedToday, refreshReminder } from '@/lib/practice-reminder';
import {
  clearPracticeTimer,
  MAX_ENTRY_MINUTES,
  setPracticeTimerTaal,
  startPracticeTimer,
  TIMER_LIMIT_MS,
  usePracticeTimer,
} from '@/lib/practice-timer';
import { usePlayhead } from '@/lib/use-playhead';
import { useRequestId } from '@/lib/use-request-id';
import { radius, spacing, useTheme } from '@/theme/use-theme';

type Mode = 'metronome' | 'taal';

/** Props for PracticeTools. */
export type PracticeToolsProps = {
  /**
   * student: S5 of a student; staff: the tools only; me: Me > Practice, a staff member's own record (0053, #319);
   * waiting: the tools only, for a login waiting for the desk (0057, #510).
   */
  area: 'student' | 'staff' | 'me' | 'waiting';
};

/** The practice tools screen. */
export function PracticeTools({ area }: PracticeToolsProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  // Logs practice on the person's own record: a student's, or a staff member's own (log_practice, 0053 #317).
  const isStudent = (area === 'student' && profile?.role === 'student') || area === 'me';
  const isGuru = profile?.role === 'guru';

  const [player] = useState(createPracticePlayer);
  useEffect(() => () => player.dispose(), [player]);

  const [mode, setMode] = useState<Mode>('metronome');
  const [playing, setPlaying] = useState(false);
  const [soundFailed, setSoundFailed] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(80);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [taalBpm, setTaalBpm] = useState(60);
  const [speed, setSpeed] = useState(1);
  const [list, setList] = useState<TaalList | undefined>(undefined);
  const [taalId, setTaalId] = useState<number | null>(null);
  // Count-in (#403): one bar of clicks before beat 1 when Start is pressed.
  const [countIn, setCountIn] = useState(true);
  // Cycle counter (#403): stop after so many bars or cycles (0 = go on); the number it stopped after, to say so.
  const [stopAfter, setStopAfter] = useState(0);
  const [stoppedAfter, setStoppedAfter] = useState<number | null>(null);
  // Step mode (#404): the taal's strokes one at a time, no loop.
  const [stepping, setStepping] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  // Speed trainer (#403): faster by `trainerTotal` in all, `trainer.step` after every `trainer.every` cycles, from
  // the tempo at the start (`trainerBase`, with the cycle it counts from).
  const [trainerOn, setTrainerOn] = useState(false);
  const [trainerTotal, setTrainerTotal] = useState(20);
  const [trainer, setTrainer] = useState<Omit<SpeedTrainer, 'target'>>({ step: 5, every: 4 });
  const [trainerBase, setTrainerBase] = useState<{ bpm: number; cycles: number } | null>(null);
  // Each start of the sound counts the cycles from 0 again (lib/use-playhead.ts).
  const [starts, setStarts] = useState(0);
  // Layakari (#491) and the kartal layer with its volume (#492), taal player; silent bars / cycles (#490), both tools.
  const [laya, setLaya] = useState<Laya>(1);
  const [kartalOn, setKartalOn] = useState(false);
  const [kartalVolume, setKartalVolume] = useState(0.5);
  const [silent, setSilent] = useState<SilentSetting>({ on: false, play: 2, mute: 2 });
  // Students: the practice of the week and this week against the goal (0052); null where not loaded.
  const [mine, setMine] = useState<MyPracticePlan | null>(null);
  const [goal, setGoal] = useState<PracticeDays | null>(null);
  // Mantra before practice (#405): the copy on this phone at once, the server's on focus; staff: may they edit.
  const [mantras, setMantras] = useState<Mantra[]>(() => savedMantras());
  const [mantraEditor, setMantraEditor] = useState(false);

  const loadMantras = useCallback(async () => {
    const [loaded, editor] = await Promise.all([fetchMantras(), area === 'staff' ? fetchCanEdit() : Promise.resolve(false)]);
    setMantras(loaded.mantras.filter((m) => m.active));
    setMantraEditor(editor);
  }, [area]);

  const loadTaals = useCallback(async () => {
    const loaded = await fetchTaals();
    // Staff may see switched-off taals here; the player offers only those switched on.
    const usable = { ...loaded, taals: loaded.taals.filter((tl) => tl.active) };
    setList(usable);
    setTaalId((current) => (current !== null && usable.taals.some((tl) => tl.id === current) ? current : usable.taals[0]?.id ?? null));
  }, []);

  const loadGoal = useCallback(async (studentId: string) => {
    setGoal(await fetchPracticeDays(studentId));
  }, []);

  const loadMine = useCallback(async () => {
    if (!isStudent) return;
    const loaded = await fetchMyPracticePlan(profileId);
    const found = loaded && loaded !== 'not_found' ? loaded : null;
    setMine(found);
    if (found) await loadGoal(found.studentId);
  }, [isStudent, profileId, loadGoal]);

  // Load on focus (the Guru may have edited a taal, the teachers the plan); the reminder's next days are scheduled
  // again; stop the sound when the screen is left.
  useFocusEffect(
    useCallback(() => {
      void loadTaals();
      void loadMine();
      void loadMantras();
      if (isStudent) void refreshReminder(profileId);
      return () => {
        player.stop();
        setPlaying(false);
      };
    }, [loadTaals, loadMine, loadMantras, isStudent, profileId, player]),
  );

  // The screen stays on while the sound plays (a dimmed phone hides the beat).
  useEffect(() => {
    if (!playing) return;
    const tag = 'practice-tools';
    activateKeepAwakeAsync(tag).catch(() => undefined); // no wake lock (some browsers): the tools still work
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, [playing]);

  // The kartal's volume changes in place, also while it plays (#492).
  useEffect(() => player.setLayerVolume('kartal', kartalVolume), [player, kartalVolume]);

  const taal: Taal | null = list?.taals.find((tl) => tl.id === taalId) ?? null;
  const cycle = useMemo(() => cyclePattern(mode, beatsPerBar, taal, laya, kartalOn), [mode, beatsPerBar, taal, laya, kartalOn]);
  // Silent cycles make one long loop: only while it fits at the tempo set (the speed trainer only makes it shorter).
  const setBpm = mode === 'metronome' ? metronomeBpm : effectiveBpm(taalBpm, speed);
  const silentOk = cycle ? silentFits(cycle.beats, setBpm, silent.play, silent.mute) : true;
  const pattern = useMemo(() => (cycle ? loopPattern(cycle, silent, silentOk) : null), [cycle, silent, silentOk]);
  // The cycles heard since the start (lib/use-playhead.ts), read before the tempo: the speed trainer's tempo follows
  // them. The playhead itself needs the tempo, so it reads the one of the frame before (a step changes it once).
  const [heardCycles, setHeardCycles] = useState<number | null>(null);
  // The speed trainer's tempo now, while it runs (#400): derived, so nothing is stored until the sound stops.
  const trained =
    trainerOn && playing && trainerBase && heardCycles !== null
      ? trainerTempo(trainerBase.bpm, { ...trainer, target: trainerBase.bpm + trainerTotal }, heardCycles - trainerBase.cycles)
      : null;
  // The tempo the student sets (and the trainer raises): before the taal player's slow-down.
  const setTempo = mode === 'metronome' ? setMetronomeBpm : setTaalBpm;
  const tempo = trained ?? (mode === 'metronome' ? metronomeBpm : taalBpm);
  const bpm = mode === 'metronome' ? tempo : effectiveBpm(tempo, speed);
  const readBeats = useMemo(() => (taal ? layaBeats(taal.bols, laya) : []), [taal, laya]);
  const head = usePlayhead(player, playing ? pattern : null, bpm, playing, starts);
  const cycles = head?.cycles ?? null;
  if (cycles !== heardCycles) setHeardCycles(cycles);
  /** The count-in clicks for a start of `forMode` (0 when it is off): one bar, a taal's first vibhag. */
  const countInFor = (forMode: Mode, tl: Taal | null) => (countIn ? countInClicks(forMode, beatsPerBar, tl?.divisions ?? []) : 0);
  /** Keeps the tempo the trainer reached (the sound stops, the trainer is switched off, the tool changes). */
  const keepTrained = () => {
    if (trained !== null) setTempo(trained);
  };

  /** After every start of the sound: the cycles count from 0, the trainer from this tempo. */
  const started = (trainedBpm: number) => {
    setStarts((n) => n + 1);
    setTrainerBase({ bpm: trainedBpm, cycles: 0 });
    setStoppedAfter(null);
    setStepping(false);
  };

  // A new pattern while playing (other taal, other bar) starts it afresh, at once; a new tempo keeps the place.
  const playingPattern = useRef<string | null>(null);
  useEffect(() => {
    if (!playing || !pattern) return;
    if (playingPattern.current !== pattern.key) {
      playingPattern.current = pattern.key;
      void player.start(pattern, bpm).then((ok) => ok && started(tempo));
    } else {
      player.setTempo(bpm);
    }
    // Only a new pattern or tempo acts here; the trainer's settings are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, pattern, bpm, player]);

  // Stop after so many cycles (#403): the playhead says a cycle ended; the sound stops just after (a timer, as the
  // stop changes the screen's state).
  useEffect(() => {
    if (!playing || stopAfter <= 0 || cycles === null || cycles < stopAfter) return;
    const id = setTimeout(() => {
      keepTrained();
      player.stop();
      playingPattern.current = null;
      setPlaying(false);
      setStoppedAfter(stopAfter);
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, stopAfter, cycles, player]);

  /** The student changes the tempo: while the trainer runs, it goes on from the new tempo. */
  const changeTempo = (next: number) => {
    setTempo(next);
    if (playing) setTrainerBase({ bpm: next, cycles: cycles ?? 0 });
  };

  const toggleTrainer = (on: boolean) => {
    if (!on) keepTrained();
    setTrainerOn(on);
    if (on && playing) setTrainerBase({ bpm: tempo, cycles: cycles ?? 0 });
  };

  useEffect(() => {
    if (isStudent && mode === 'taal') setPracticeTimerTaal(taalId);
  }, [isStudent, mode, taalId]);

  const toggle = async () => {
    if (playing) {
      keepTrained();
      player.stop();
      playingPattern.current = null;
      setPlaying(false);
      return;
    }
    if (!pattern) return;
    const ok = await player.start(pattern, bpm, countInFor(mode, taal));
    setSoundFailed(!ok);
    if (!ok) return;
    playingPattern.current = pattern.key;
    setPlaying(true);
    started(tempo);
    if (isStudent) startPracticeTimer(profileId, mode === 'taal' ? taalId : null);
  };

  // Record myself: what is chosen now, and starting a sound from its first beat.
  const recordSetting: RecordingSetting | null =
    mode === 'metronome'
      ? { mode: 'metronome', bpm: metronomeBpm, beatsPerBar }
      : taal
        ? { mode: 'taal', taalId: taal.id, taalName: taal.name, taalBpm, speed, laya }
        : null;

  /** A taal's loop with the extras chosen now (layakari, kartal, silent cycles), at `atBpm`. */
  const taalLoop = (tl: Taal, atBpm: number, tlLaya: Laya = laya) => {
    const next = cyclePattern('taal', beatsPerBar, tl, tlLaya, kartalOn) as Pattern;
    return loopPattern(next, silent, silentFits(next.beats, atBpm, silent.play, silent.mute));
  };

  /** Starts `next` afresh (Record myself at once, from beat 1; the practice of the week after its count-in). */
  const startFrom = async (next: NonNullable<typeof pattern>, nextBpm: number, timerTaal: number | null, clicks = 0, trainedBpm = nextBpm) => {
    player.stop();
    const ok = await player.start(next, nextBpm, clicks);
    setSoundFailed(!ok);
    if (!ok) return false;
    playingPattern.current = next.key;
    setPlaying(true);
    started(trainedBpm);
    if (isStudent) startPracticeTimer(profileId, timerTaal);
    return true;
  };

  /** The practice of the week's taal at its tempo, full speed, after the count-in when it is on. */
  const startPlanTaal = (tl: Taal, planBpm: number) => {
    const next = clampBpm(planBpm);
    setMode('taal');
    setTaalId(tl.id);
    setTaalBpm(next);
    setSpeed(1);
    void startFrom(taalLoop(tl, next), next, tl.id, countInFor('taal', tl), next);
  };

  // Step mode (#404): the strokes of the taal one by one; the shown stroke stays within the list.
  const steps = useMemo(() => (taal ? taalSteps(taal.bols) : []), [taal]);
  const step = stepping && steps.length > 0 ? steps[Math.min(stepIndex, steps.length - 1)] : null;
  const toggleStepping = (on: boolean) => {
    if (on) stopSound();
    setStepIndex(0);
    setStepping(on);
  };
  /** Plays the shown stroke once, slowly enough to hear both hands of a combined bol. */
  const hearStep = () => {
    if (step) void player.playOnce(bolPattern(step.bol), 60).then((ok) => setSoundFailed(!ok));
  };

  /** The timer saved practice: this week and the reminder know it at once. */
  const practiceSaved = () => {
    void notePractisedToday(profileId);
    if (mine) void loadGoal(mine.studentId);
  };

  const startSoundOf = async (s: RecordingSetting) => {
    // The pattern started is the one the screen then shows (same key), so it is not started again.
    if (s.mode === 'metronome') {
      setMode('metronome');
      setMetronomeBpm(s.bpm);
      setBeatsPerBar(s.beatsPerBar);
      const bar = metronomePattern(s.beatsPerBar);
      return startFrom(loopPattern(bar, silent, silentFits(bar.beats, s.bpm, silent.play, silent.mute)), s.bpm, null);
    }
    const found = list?.taals.find((tl) => tl.id === s.taalId);
    if (!found) return false;
    const recordedLaya = s.mode === 'taal' ? (s.laya ?? 1) : 1;
    setMode('taal');
    setTaalId(found.id);
    setTaalBpm(s.taalBpm);
    setSpeed(s.speed);
    setLaya(recordedLaya);
    const at = effectiveBpm(s.taalBpm, s.speed);
    return startFrom(taalLoop(found, at, recordedLaya), at, found.id, 0, s.taalBpm);
  };

  const stopSound = () => {
    player.stop();
    playingPattern.current = null;
    setPlaying(false);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    keepTrained();
    player.stop();
    playingPattern.current = null;
    setPlaying(false);
    setMode(next);
  };

  // During a rest, or a silent cycle (#490), nothing is struck: the drum shows no bol. In the step mode, the stroke
  // shown.
  const bolNow = step
    ? step.bol
    : head && mode === 'taal' && !head.silent && !readBeats[head.beat]?.every((b) => b.text === '-')
      ? readBeats[head.bolBeat]?.[head.part] ?? null
      : null;

  const cycleNow = (unit: 'bars' | 'cycles') => (
    <CycleNow cycles={cycles} playing={playing} unit={unit} stopAfter={stopAfter} stoppedAfter={stoppedAfter} silent={head?.silent ?? false} />
  );

  /** Under the tool's own settings: the count-in, stop after, silent bars / cycles (#490) and the speed trainer (#403). */
  const playSettings = (unit: 'bars' | 'cycles') => (
    <>
      <Checkbox label={t('practice.countIn')} checked={countIn} onChange={setCountIn} />
      <StopAfterChoice unit={unit} value={stopAfter} onChange={setStopAfter} />
      <SilentFields value={silent} onChange={setSilent} unit={unit} fits={silentOk} />
      <SpeedTrainerFields
        on={trainerOn}
        onToggle={toggleTrainer}
        total={trainerTotal}
        onTotal={setTrainerTotal}
        trainer={trainer}
        onTrainer={setTrainer}
        unit={unit}
        running={playing && trainerOn && trainerBase ? { base: trainerBase.bpm, cycles: (cycles ?? 0) - trainerBase.cycles } : null}
      />
    </>
  );

  const startButton = (disabled: boolean) => (
    <Button
      size="large"
      icon={playing ? 'pause' : 'play'}
      label={playing ? t('practice.stop') : t('practice.start')}
      disabled={disabled}
      onPress={() => void toggle()}
    />
  );

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('practice.title') }} />

      <MantraEntry area={area === 'me' ? 'staff' : area} mantras={mantras} canEdit={mantraEditor} />

      {isStudent ? (
        <PracticeTimerLine profileId={profileId} onSaved={practiceSaved} />
      ) : (
        <AppText tone="muted">{t('practice.staffHint')}</AppText>
      )}

      {isStudent && mine && list ? <PlanSection mine={mine} taals={list.taals} onStartTaal={startPlanTaal} /> : null}

      <ChoiceGroup<Mode>
        label={t('practice.tool')}
        value={mode}
        onChange={switchMode}
        choices={[
          { value: 'metronome', label: t('practice.metronome'), icon: 'practice' },
          { value: 'taal', label: t('practice.taalPlayer'), icon: 'instruments' },
        ]}
      />

      {soundFailed ? (
        <Notice tone="error" title={t('practice.soundFailedTitle')}>
          {t('practice.soundFailed')}
        </Notice>
      ) : null}

      {mode === 'metronome' ? (
        <Section icon="practice" title={t('practice.metronome')} description={t('practice.metronomeIntro')}>
          {/* Start right under the tempo, on the first screen (#384); the dots light in time under it. */}
          <TempoControl bpm={tempo} onChange={changeTempo}>
            {startButton(false)}
            <BeatDots count={beatsPerBar} current={head?.beat ?? null} />
            {cycleNow('bars')}
          </TempoControl>
          <ChoiceGroup<number>
            segmented
            label={t('practice.beatsInBar')}
            value={beatsPerBar}
            onChange={setBeatsPerBar}
            choices={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))}
          />
          {playSettings('bars')}
        </Section>
      ) : (
        <>
          <Section icon="instruments" title={t('practice.taalPlayer')} description={t('practice.taalIntro')}>
            {list === undefined ? <LoadingCards /> : null}
            {list?.saved ? (
              <Notice tone="info" title={t('practice.savedTaalsTitle')}>
                {t('practice.savedTaals')}
              </Notice>
            ) : null}
            {list && list.taals.length === 0 ? <AppText tone="muted">{t('practice.noTaals')}</AppText> : null}
            {list && list.taals.length > 0 ? (
              <ChoiceGroup<number>
                chips
                label={t('practice.taal')}
                value={taalId}
                onChange={setTaalId}
                choices={list.taals.map((tl) => ({ value: tl.id, label: t('practice.taalChoice', { name: tl.name, beats: tl.beats }) }))}
              />
            ) : null}
            {taal ? (
              <AppText variant="small" tone="muted">
                {[
                  taal.levelId ? levelName(t, taal.levelId) : t('practice.allLevels'),
                  t('practice.divisions', { divisions: taal.divisions.join(' + ') }),
                ].join(' · ')}
              </AppText>
            ) : null}
            {taal?.placeholder ? (
              <Notice tone="info" title={t('practice.placeholderTitle')}>
                {taal.note ?? t('practice.placeholder')}
              </Notice>
            ) : null}
            <TempoControl bpm={tempo} onChange={changeTempo}>
              {startButton(!taal)}
              {cycleNow('cycles')}
            </TempoControl>
            <ChoiceGroup<number>
              chips
              label={t('practice.speed')}
              value={speed}
              onChange={setSpeed}
              choices={[
                { value: 0.5, label: '50 %' },
                { value: 0.75, label: '75 %' },
                { value: 1, label: '100 %' },
              ]}
            />
            {speed < 1 ? (
              <AppText variant="small" tone="muted">
                {t('practice.playingAt', { bpm: Math.round(bpm * 10) / 10 })}
              </AppText>
            ) : null}
            <LayaChoice value={laya} onChange={setLaya} />
            <KartalFields on={kartalOn} onToggle={setKartalOn} volume={kartalVolume} onVolume={setKartalVolume} />
            {playSettings('cycles')}
          </Section>
          {taal ? (
            <Section icon="syllabus" title={t('practice.gridTitle', { name: taal.name })}>
              {/* The step mode goes through the bols as written, so its grid is as written too. */}
              <BeatGrid
                bols={taal.bols}
                divisions={taal.divisions}
                marks={taal.marks}
                current={step ? step.beat : head?.beat ?? null}
                hands
                laya={step ? 1 : laya}
              />
            </Section>
          ) : null}
          {taal ? (
            <Section icon="instruments" title={t('practice.twoHeadTitle')} description={t('practice.twoHeadIntro')}>
              <StepControls
                on={stepping}
                onToggle={toggleStepping}
                index={Math.min(stepIndex, Math.max(0, steps.length - 1))}
                total={steps.length}
                beat={step?.beat ?? null}
                onIndex={setStepIndex}
                onHear={hearStep}
              />
              <TwoHeadView bol={bolNow} fresh={step ? true : head?.fresh ?? false} />
            </Section>
          ) : null}
        </>
      )}

      <RecordMyself
        setting={recordSetting}
        startSound={() => (pattern ? startFrom(pattern, bpm, mode === 'taal' ? taalId : null) : Promise.resolve(false))}
        startSoundOf={startSoundOf}
        stopSound={stopSound}
      />

      {area !== 'waiting' ? <PlayAndLearn area={area} /> : null}

      {isStudent && goal && mine ? (
        <Section icon="promote" title={t('practice.goalTitle')}>
          <GoalWeekView practice={goal} />
          <GoalFold practice={goal} onSaved={() => void loadGoal(mine.studentId)} />
        </Section>
      ) : null}
      {isStudent ? <ReminderFold profileId={profileId} /> : null}

      {isStudent ? (
        <Button variant="link" icon="time" label={t('practiceLog.open')} onPress={() => router.push(area === 'me' ? '/staff/me/practice-log' : '/student/practice-log')} />
      ) : null}
      {area === 'staff' && (isGuru || profile?.role === 'coordinator') ? (
        <Button variant="secondary" icon="todo" label={t('practicePlan.open')} onPress={() => router.push('/staff/practice-plan')} />
      ) : null}
      {area === 'staff' && (isGuru || profile?.role === 'coordinator') ? (
        <Button variant="secondary" icon="students" label={t('practiceExtras.weekOpen')} onPress={() => router.push('/staff/practice-week')} />
      ) : null}
      {isGuru ? <Button variant="secondary" icon="edit" label={t('taals.edit')} onPress={() => router.push('/staff/taals')} /> : null}
    </Screen>
  );
}

/** Tempo: the number, then `children` (the Start button, #384), then −5 / −1 / +1 / +5 and tap tempo. */
function TempoControl({ bpm, onChange, children }: PropsWithChildren<{ bpm: number; onChange: (bpm: number) => void }>) {
  const { t } = useTranslation();
  const [taps, setTaps] = useState<number[]>([]);
  const step = (by: number) => onChange(clampBpm(bpm + by));
  const tap = () => {
    const now = Date.now();
    const next = [...taps.filter((x) => now - x < 6000), now].slice(-6);
    setTaps(next);
    const tempo = tapTempo(next);
    if (tempo !== null) onChange(tempo);
  };
  return (
    <View style={styles.tempo}>
      {/* Spoken again after each change, so a blind student hears the new tempo (audit P2-04, #332). */}
      <View style={styles.tempoValue} accessible accessibilityLabel={t('practice.bpmLabel', { bpm })} accessibilityLiveRegion="polite">
        <AppText variant="title" family="sans">{bpm}</AppText>
        <AppText tone="muted">{t('practice.bpm', { min: MIN_BPM, max: MAX_BPM })}</AppText>
      </View>
      {children}
      <View style={styles.steps}>
        {[-5, -1, 1, 5].map((by) => (
          <View key={by} style={styles.step}>
            <Button
              variant="secondary"
              label={by > 0 ? `+${by}` : `−${-by}`}
              accessibilityLabel={by > 0 ? t('practice.tempoFaster', { by }) : t('practice.tempoSlower', { by: -by })}
              disabled={(by < 0 && bpm <= MIN_BPM) || (by > 0 && bpm >= MAX_BPM)}
              onPress={() => step(by)}
            />
          </View>
        ))}
      </View>
      <Button variant="secondary" icon="tap" label={t('practice.tap')} onPress={tap} />
      <AppText variant="small" tone="muted">
        {t('practice.tapHint')}
      </AppText>
    </View>
  );
}

/** One dot per beat of the bar, the first larger (accent), the one heard filled. */
function BeatDots({ count, current }: { count: number; current: number | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} aria-hidden>
      {Array.from({ length: count }, (_, beat) => {
        const size = beat === 0 ? 36 : 26;
        const on = beat === current;
        return (
          <View
            key={beat}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 2,
              borderColor: colors.primary,
              backgroundColor: on ? colors.primary : 'transparent',
            }}
          />
        );
      })}
    </View>
  );
}

/**
 * Students: the practice timer as one slim line above the tools (#384), so Start stays on the first screen; while it
 * runs, the time with Stop and save, and Throw away under it; what happened when it was stopped.
 */
function PracticeTimerLine({ profileId, onSaved }: { profileId: string; onSaved: () => void }) {
  // #322: one id per timed session, so Stop tapped again after a lost answer logs it once.
  const { requestId, renew: renewRequestId } = useRequestId();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const timer = usePracticeTimer(profileId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);
  // "How did it go?" (#494) for the entry just saved; the chips start with Taal when the timer played one.
  const [asking, setAsking] = useState<{ id: number; initial: Practised[] } | null>(null);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [timer]);

  const elapsedMs = timer ? now - Date.parse(timer.startedAt) : 0;
  const minutes = Math.max(0, Math.floor(elapsedMs / 60000));

  const stop = async () => {
    if (!timer) return;
    const ms = Date.now() - Date.parse(timer.startedAt);
    const done = Math.floor(ms / 60000);
    if (ms > TIMER_LIMIT_MS) {
      clearPracticeTimer();
      setResult({ tone: 'info', text: t('practice.timerForgotten') });
      return;
    }
    if (done < 1) {
      clearPracticeTimer();
      setResult({ tone: 'info', text: t('practice.timerTooShort') });
      return;
    }
    setBusy(true);
    const logged = Math.min(done, MAX_ENTRY_MINUTES);
    const saved = await logPractice({ minutes: logged, source: 'timer', startedAt: timer.startedAt, taalId: timer.taalId }, requestId());
    setBusy(false);
    if ('errorKey' in saved) {
      // Kept running, so nothing is lost; the student can try again or type it in S6.
      setResult({ tone: 'error', text: t(saved.errorKey) });
      return;
    }
    clearPracticeTimer();
    renewRequestId();
    setResult({ tone: 'success', text: t('practice.timerLogged', { time: practiceTime(t, logged) }) });
    setAsking(saved.id !== null ? { id: saved.id, initial: timer.taalId !== null ? ['taal'] : [] } : null);
    onSaved();
  };

  return (
    <View style={styles.timerWrap}>
      <View style={[styles.timerLine, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="time" size={22} color={colors.primary} />
        <AppText variant={timer ? 'label' : 'small'} tone={timer ? 'default' : 'muted'} style={styles.timerText}>
          {timer ? t('practice.timerRunning', { time: practiceTime(t, minutes) }) : t('practice.timerIdle')}
        </AppText>
        {timer ? (
          <Button variant="link" icon="check" label={t('practice.timerStop')} loading={busy} onPress={() => void stop()} />
        ) : (
          <Button
            variant="link"
            label={t('practice.timerStartNow')}
            accessibilityLabel={t('practice.timerStart')}
            onPress={() => {
              setResult(null);
              setAsking(null);
              startPracticeTimer(profileId, null);
            }}
          />
        )}
      </View>
      {timer ? (
        <Button
          variant="link"
          label={t('practice.timerDiscard')}
          onPress={() => {
            clearPracticeTimer();
            setResult(null);
          }}
        />
      ) : null}
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      {asking && !timer ? <FeelingPrompt key={asking.id} entryId={asking.id} initial={asking.initial} onClose={() => setAsking(null)} /> : null}
    </View>
  );
}

/** One cycle to play: the metronome's bar, or the taal at its layakari (#491) with the kartal when on (#492). */
function cyclePattern(mode: Mode, beatsPerBar: number, tl: Taal | null, laya: Laya, kartal: boolean): Pattern | null {
  if (mode === 'metronome') return metronomePattern(beatsPerBar);
  if (!tl) return null;
  const cycle = taalPattern(tl.bols, laya);
  return kartal ? withKartal(cycle, tl.divisions) : cycle;
}

/** The loop: the cycle, then the silent cycles when they are on and `fits` (#490). */
function loopPattern(cycle: Pattern, silent: SilentSetting, fits: boolean): Pattern {
  return silent.on && fits ? withSilentCycles(cycle, silent.play, silent.mute) : cycle;
}

const styles = StyleSheet.create({
  tempo: {
    gap: spacing.sm,
  },
  tempoValue: {
    alignItems: 'center',
  },
  steps: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  step: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    // Eight dots stay on one line at 375 px.
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius,
  },
  timerWrap: {
    gap: spacing.xs,
  },
  timerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderRadius: radius,
  },
  timerText: {
    flex: 1,
  },
});
