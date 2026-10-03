// Recording in the app (Phase 2 slice 4, docs/DECISIONS.md #52): Record, the running time, Stop.
// Two ways to finish:
// - 'review' (S7 recording, C14 voice note): after Stop the take can be played, used or recorded
//   again; "Use" hands it to the screen, which uploads it when the form is sent.
// - 'auto' (S5 "Record myself"): every take goes straight to the screen, which keeps it on the phone.
// It stops by itself at `maxSeconds`. PlayButton plays a take or a kept recording.
// expo-audio (next planned APK); in the browser it records through MediaRecorder.

import { useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { askMicrophone, RECORDING_OPTIONS, setRecordingMode, takeOf, type RecordedTake } from '@/lib/recording';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';

/** 83 400 ms → "1:23". */
export function durationText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Props for AudioRecorderPanel. */
export type AudioRecorderPanelProps = {
  mode: 'review' | 'auto';
  /** The longest take, in seconds; it stops by itself then. */
  maxSeconds: number;
  /** 'review': the take the person chose to use. 'auto': every finished take. */
  onTake: (take: RecordedTake) => void | Promise<void>;
  /** Called the moment recording starts (S5 starts the metronome or taal with it). */
  onStart?: () => void | Promise<void>;
  /** Called when recording stops (S5 stops the sound). */
  onStop?: () => void;
  /** Words on the "Use" button ('review'). */
  useLabel?: string;
  /** False while the screen must not start a recording. */
  disabled?: boolean;
};

/** Record / Stop with the time, and for 'review' the take to play, use or record again. */
export function AudioRecorderPanel({ mode, maxSeconds, onTake, onStart, onStop, useLabel, disabled }: AudioRecorderPanelProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const [take, setTake] = useState<RecordedTake | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const startedAt = useRef<string | null>(null);
  const recording = state.isRecording;

  async function start() {
    setProblem(null);
    setBusy(true);
    try {
      if (!(await askMicrophone())) {
        setProblem(t('recording.noMicrophone'));
        return;
      }
      await setRecordingMode(true);
      await recorder.prepareToRecordAsync();
      startedAt.current = new Date().toISOString();
      recorder.record();
      await onStart?.();
    } catch {
      setProblem(t('recording.failed'));
      await setRecordingMode(false);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    const durationMs = state.durationMillis;
    try {
      await recorder.stop();
      onStop?.();
      await setRecordingMode(false);
      const uri = recorder.uri;
      if (!uri) throw new Error('no file');
      const finished = await takeOf(uri, durationMs, startedAt.current ?? new Date().toISOString());
      if (mode === 'auto') await onTake(finished);
      else setTake(finished);
    } catch {
      onStop?.();
      setProblem(t('recording.failed'));
    } finally {
      setBusy(false);
    }
  }

  // Stops by itself at the longest allowed take.
  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  });
  useEffect(() => {
    if (recording && state.durationMillis >= maxSeconds * 1000) void stopRef.current();
  }, [recording, state.durationMillis, maxSeconds]);

  // Leaving the screen while recording stops it (and gives the microphone back).
  useEffect(
    () => () => {
      if (recorder.isRecording) void recorder.stop().catch(() => undefined);
    },
    [recorder],
  );

  if (take && mode === 'review') {
    return (
      <View style={[styles.box, { borderColor: colors.border }]}>
        <AppText variant="label">{t('recording.ready', { time: durationText(take.durationMs) })}</AppText>
        <View style={styles.row}>
          <PlayButton uri={take.uri} />
          <Button
            icon="check"
            label={useLabel ?? t('recording.use')}
            loading={busy}
            onPress={() => {
              void onTake(take);
              setTake(null);
            }}
          />
          <Button variant="link" icon="refresh" label={t('recording.again')} onPress={() => setTake(null)} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.box, { borderColor: recording ? colors.danger : colors.border }]}>
      <View style={styles.row}>
        {recording ? (
          <Button icon="pause" label={t('recording.stop')} loading={busy} onPress={() => void stop()} />
        ) : (
          <Button icon="record" label={t('recording.record')} loading={busy} disabled={disabled} onPress={() => void start()} />
        )}
        <AppText variant="label" tone={recording ? 'danger' : 'muted'} accessibilityLiveRegion="none">
          {recording
            ? t('recording.recordingFor', { time: durationText(state.durationMillis), max: durationText(maxSeconds * 1000) })
            : t('recording.upTo', { max: durationText(maxSeconds * 1000) })}
        </AppText>
      </View>
      {problem ? <Notice tone="error">{problem}</Notice> : null}
    </View>
  );
}

/** Play / Stop for one recording (a take on this device, or a kept recording). */
export function PlayButton({ uri, label }: { uri: string; label?: string }) {
  const { t } = useTranslation();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  useEffect(() => {
    // At the end, go back to the start so Play plays it again.
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);

  return (
    <Button
      variant="secondary"
      icon={playing ? 'pause' : 'play'}
      label={playing ? t('recording.stopPlaying') : (label ?? t('recording.play'))}
      onPress={() => {
        if (playing) {
          player.pause();
          void player.seekTo(0);
        } else {
          void setRecordingMode(false).then(() => player.play());
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
