// S5 Practice tools (Phase 2 slice 3, docs/DECISIONS.md #49), for students (route
// student/practice.tsx) and staff (staff/practice.tsx):
// - Metronome: 30-240 beats a minute, tap tempo, beats in a bar with an accent on beat 1, a row of
//   beat dots lit in time.
// - Taal player: loops a taal (table taals; offline from the copy on the phone) at any tempo with a
//   slow-down of 50 %, 75 % or 100 %, the beat-name grid (vibhags with X / 2 / 0 marks) and the
//   two-head view V1 (components/two-head-view.tsx) lit in time with the sound.
// - Practice timer (students only): starts with the first sound or by hand, logs itself on Stop when
//   it ran at least a minute (S6; lib/practice-timer.ts, data/practice.ts).
// Sound: lib/practice-audio(.web).ts; timing is kept by the audio clock, not by JavaScript timers.
// The Guru sees "Edit taals" (staff/taals). The sound stops when the screen is left.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BeatGrid } from '@/components/beat-grid';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { practiceTime } from '@/components/practice-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TwoHeadView } from '@/components/two-head-view';
import { fetchTaals, logPractice, type Taal, type TaalList } from '@/data/practice';
import { levelName } from '@/i18n/labels';
import { createPracticePlayer } from '@/lib/practice-audio';
import { clampBpm, effectiveBpm, metronomePattern, readTaal, tapTempo, taalPattern, MAX_BPM, MIN_BPM } from '@/lib/practice-pattern';
import {
  clearPracticeTimer,
  MAX_ENTRY_MINUTES,
  setPracticeTimerTaal,
  startPracticeTimer,
  TIMER_LIMIT_MS,
  usePracticeTimer,
} from '@/lib/practice-timer';
import { usePlayhead } from '@/lib/use-playhead';
import { radius, spacing, useTheme } from '@/theme/use-theme';

type Mode = 'metronome' | 'taal';

/** Props for PracticeTools. */
export type PracticeToolsProps = { area: 'student' | 'staff' };

/** The practice tools screen. */
export function PracticeTools({ area }: PracticeToolsProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';
  const isStudent = area === 'student' && profile?.role === 'student';
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

  const loadTaals = useCallback(async () => {
    const loaded = await fetchTaals();
    // Staff may see switched-off taals here; the player offers only those switched on.
    const usable = { ...loaded, taals: loaded.taals.filter((tl) => tl.active) };
    setList(usable);
    setTaalId((current) => (current !== null && usable.taals.some((tl) => tl.id === current) ? current : usable.taals[0]?.id ?? null));
  }, []);

  // Load on focus (the Guru may have edited a taal); stop the sound when the screen is left.
  useFocusEffect(
    useCallback(() => {
      void loadTaals();
      return () => {
        player.stop();
        setPlaying(false);
      };
    }, [loadTaals, player]),
  );

  const taal: Taal | null = list?.taals.find((tl) => tl.id === taalId) ?? null;
  const pattern = useMemo(
    () => (mode === 'metronome' ? metronomePattern(beatsPerBar) : taal ? taalPattern(taal.bols) : null),
    [mode, beatsPerBar, taal],
  );
  const bpm = mode === 'metronome' ? metronomeBpm : effectiveBpm(taalBpm, speed);
  const readBeats = useMemo(() => (taal ? readTaal(taal.bols) : []), [taal]);
  const head = usePlayhead(player, playing ? pattern : null, bpm, playing);

  // A new pattern while playing (other taal, other bar) starts it afresh; a new tempo keeps the place.
  const playingPattern = useRef<string | null>(null);
  useEffect(() => {
    if (!playing || !pattern) return;
    if (playingPattern.current !== pattern.key) {
      playingPattern.current = pattern.key;
      void player.start(pattern, bpm);
    } else {
      player.setTempo(bpm);
    }
  }, [playing, pattern, bpm, player]);

  useEffect(() => {
    if (isStudent && mode === 'taal') setPracticeTimerTaal(taalId);
  }, [isStudent, mode, taalId]);

  const toggle = async () => {
    if (playing) {
      player.stop();
      playingPattern.current = null;
      setPlaying(false);
      return;
    }
    if (!pattern) return;
    const ok = await player.start(pattern, bpm);
    setSoundFailed(!ok);
    if (!ok) return;
    playingPattern.current = pattern.key;
    setPlaying(true);
    if (isStudent) startPracticeTimer(profileId, mode === 'taal' ? taalId : null);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    player.stop();
    playingPattern.current = null;
    setPlaying(false);
    setMode(next);
  };

  // During a rest nothing is struck: the drum shows no bol.
  const bolNow = head && mode === 'taal' && readBeats[head.beat]?.[0]?.text !== '-' ? readBeats[head.bolBeat]?.[head.part] ?? null : null;

  return (
    <Screen underHeader wide>
      <Stack.Screen options={{ title: t('practice.title') }} />

      {isStudent ? <PracticeTimerCard profileId={profileId} /> : <AppText tone="muted">{t('practice.staffHint')}</AppText>}

      <ChoiceGroup<Mode>
        label={t('practice.tool')}
        value={mode}
        onChange={switchMode}
        choices={[
          { value: 'metronome', label: t('practice.metronome'), icon: 'time' },
          { value: 'taal', label: t('practice.taalPlayer'), icon: 'instruments' },
        ]}
      />

      {soundFailed ? (
        <Notice tone="error" title={t('practice.soundFailedTitle')}>
          {t('practice.soundFailed')}
        </Notice>
      ) : null}

      {mode === 'metronome' ? (
        <Section icon="time" title={t('practice.metronome')} description={t('practice.metronomeIntro')}>
          <TempoControl bpm={metronomeBpm} onChange={setMetronomeBpm} />
          <ChoiceGroup<number>
            chips
            label={t('practice.beatsInBar')}
            value={beatsPerBar}
            onChange={setBeatsPerBar}
            choices={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: String(n) }))}
          />
          <BeatDots count={beatsPerBar} current={head?.beat ?? null} />
          <Button
            size="large"
            icon={playing ? 'pause' : 'play'}
            label={playing ? t('practice.stop') : t('practice.start')}
            onPress={() => void toggle()}
          />
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
            <TempoControl bpm={taalBpm} onChange={setTaalBpm} />
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
            <Button
              size="large"
              icon={playing ? 'pause' : 'play'}
              label={playing ? t('practice.stop') : t('practice.start')}
              disabled={!taal}
              onPress={() => void toggle()}
            />
          </Section>
          {taal ? (
            <Section icon="syllabus" title={t('practice.gridTitle', { name: taal.name })}>
              <BeatGrid bols={taal.bols} divisions={taal.divisions} marks={taal.marks} current={head?.beat ?? null} />
            </Section>
          ) : null}
          {taal ? (
            <Section icon="instruments" title={t('practice.twoHeadTitle')} description={t('practice.twoHeadIntro')}>
              <TwoHeadView bol={bolNow} fresh={head?.fresh ?? false} />
            </Section>
          ) : null}
        </>
      )}

      {isStudent ? (
        <Button variant="link" icon="time" label={t('practiceLog.open')} onPress={() => router.push('/student/practice-log')} />
      ) : null}
      {isGuru ? <Button variant="secondary" icon="edit" label={t('taals.edit')} onPress={() => router.push('/staff/taals')} /> : null}
    </Screen>
  );
}

/** Tempo: the number, −5 / −1 / +1 / +5 and tap tempo. */
function TempoControl({ bpm, onChange }: { bpm: number; onChange: (bpm: number) => void }) {
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
      <View style={styles.tempoValue} accessible accessibilityLabel={t('practice.bpmLabel', { bpm })}>
        <AppText variant="title">{bpm}</AppText>
        <AppText tone="muted">{t('practice.bpm', { min: MIN_BPM, max: MAX_BPM })}</AppText>
      </View>
      <View style={styles.steps}>
        {[-5, -1, 1, 5].map((by) => (
          <View key={by} style={styles.step}>
            <Button
              variant="secondary"
              label={by > 0 ? `+${by}` : `−${-by}`}
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

/** Students: the practice timer, and what happened when it was stopped. */
function PracticeTimerCard({ profileId }: { profileId: string }) {
  const { t } = useTranslation();
  const timer = usePracticeTimer(profileId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);

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
    const errorKey = await logPractice({ minutes: logged, source: 'timer', startedAt: timer.startedAt, taalId: timer.taalId });
    setBusy(false);
    if (errorKey) {
      // Kept running, so nothing is lost; the student can try again or type it in S6.
      setResult({ tone: 'error', text: t(errorKey) });
      return;
    }
    clearPracticeTimer();
    setResult({ tone: 'success', text: t('practice.timerLogged', { time: practiceTime(t, logged) }) });
  };

  return (
    <Section icon="time" title={t('practice.timerTitle')} description={timer ? undefined : t('practice.timerIntro')}>
      {timer ? (
        <AppText variant="subtitle">
          {t('practice.timerRunning', { time: practiceTime(t, minutes) })}
        </AppText>
      ) : null}
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      {timer ? (
        <>
          <Button icon="check" label={t('practice.timerStop')} loading={busy} onPress={() => void stop()} />
          <Button
            variant="link"
            label={t('practice.timerDiscard')}
            onPress={() => {
              clearPracticeTimer();
              setResult(null);
            }}
          />
        </>
      ) : (
        <Button
          variant="secondary"
          icon="time"
          label={t('practice.timerStart')}
          onPress={() => {
            setResult(null);
            startPracticeTimer(profileId, null);
          }}
        />
      )}
    </Section>
  );
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
    gap: spacing.md,
    minHeight: 44,
    borderRadius: radius,
  },
});
