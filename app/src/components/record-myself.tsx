// "Record myself" on S5 Practice tools (Phase 2 slice 4, docs/DECISIONS.md #52): record your own
// playing, keep it on this phone (lib/my-recordings.ts; never uploaded), play it back, and compare
// it with the taal player: when "with the sound" is on, the metronome or taal starts from its first
// beat the moment recording starts, and "Play with the sound" later starts the same sound and the
// recording together, so a late or early stroke is heard against the beat. Headphones keep the
// sound out of the recording.

import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { formatDateTimeInIndia } from '@/lib/dates';
import {
  deleteMyRecording,
  keepMyRecording,
  listMyRecordings,
  MAX_RECORDINGS,
  type MyRecording,
  type RecordingSetting,
} from '@/lib/my-recordings';
import { setRecordingMode } from '@/lib/recording';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { AudioRecorderPanel, durationText } from './audio-recorder';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Notice } from './notice';
import { Section } from './section';

/** Longest take: 10 minutes. */
const MAX_SECONDS = 10 * 60;

/** Props for RecordMyself. */
export type RecordMyselfProps = {
  /** What is chosen on the screen now (metronome or taal and its tempo); null when nothing can play. */
  setting: RecordingSetting | null;
  /** Starts the chosen sound from its first beat. False when it could not start. */
  startSound: () => Promise<boolean>;
  /** Starts a recording's sound (switches the screen to it) from its first beat. */
  startSoundOf: (setting: RecordingSetting) => Promise<boolean>;
  stopSound: () => void;
};

/** The words for a setting: "Metronome · 80 a minute" or "Dasapahira · 60 a minute at 75 %". */
export function useSettingText() {
  const { t } = useTranslation();
  return useCallback(
    (s: RecordingSetting | null) =>
      s === null
        ? t('recordMyself.noSound')
        : s.mode === 'metronome'
          ? t('recordMyself.metronomeAt', { bpm: s.bpm, beats: s.beatsPerBar })
          : s.speed < 1
            ? t('recordMyself.taalAtSpeed', { name: s.taalName, bpm: s.taalBpm, percent: Math.round(s.speed * 100) })
            : t('recordMyself.taalAt', { name: s.taalName, bpm: s.taalBpm }),
    [t],
  );
}

/** Record, keep and compare one's own playing. */
export function RecordMyself({ setting, startSound, startSoundOf, stopSound }: RecordMyselfProps) {
  const { t } = useTranslation();
  const settingText = useSettingText();
  const [withSound, setWithSound] = useState(true);
  const [list, setList] = useState<MyRecording[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  // The setting of the take being recorded (null when recorded without the sound).
  const [recordingSetting, setRecordingSetting] = useState<RecordingSetting | null>(null);

  useEffect(() => {
    void listMyRecordings().then(setList);
  }, []);

  return (
    <Section icon="record" title={t('recordMyself.title')} description={t('recordMyself.intro')}>
      <Checkbox
        label={t('recordMyself.withSound', { what: settingText(setting) })}
        checked={withSound && setting !== null}
        onChange={setWithSound}
      />
      <AppText variant="small" tone="muted">
        {t('recordMyself.headphones')}
      </AppText>
      <AudioRecorderPanel
        mode="auto"
        maxSeconds={MAX_SECONDS}
        onStart={async () => {
          setProblem(null);
          const used = withSound && setting !== null ? setting : null;
          setRecordingSetting(used);
          if (used && !(await startSound())) setProblem(t('practice.soundFailed'));
        }}
        onStop={() => {
          if (recordingSetting) stopSound();
        }}
        onTake={async (take) => {
          try {
            const kept = await keepMyRecording(take, recordingSetting);
            setList((current) => [kept, ...current].slice(0, MAX_RECORDINGS));
          } catch {
            setProblem(t('recordMyself.keepFailed'));
          }
        }}
      />
      {problem ? <Notice tone="error">{problem}</Notice> : null}
      <AppText variant="small" tone="muted">
        {Platform.OS === 'web' ? t('recordMyself.keptWeb') : t('recordMyself.keptPhone', { max: MAX_RECORDINGS })}
      </AppText>
      {list.length === 0 ? <AppText tone="muted">{t('recordMyself.none')}</AppText> : null}
      {list.map((r) => (
        <RecordingRow
          key={r.id}
          recording={r}
          settingText={settingText(r.setting)}
          startSoundOf={startSoundOf}
          stopSound={stopSound}
          onDelete={async () => {
            await deleteMyRecording(r.id);
            setList((current) => current.filter((x) => x.id !== r.id));
          }}
        />
      ))}
    </Section>
  );
}

/** One kept recording: play it, play it with its sound, delete it (asks first). */
function RecordingRow({
  recording,
  settingText,
  startSoundOf,
  stopSound,
  onDelete,
}: {
  recording: MyRecording;
  settingText: string;
  startSoundOf: (setting: RecordingSetting) => Promise<boolean>;
  stopSound: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const player = useAudioPlayer(recording.uri);
  const status = useAudioPlayerStatus(player);
  // True while the recording plays beside its sound (the sound stops with it).
  const alongside = useRef(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!status.didJustFinish) return;
    void player.seekTo(0);
    if (alongside.current) {
      stopSound();
      alongside.current = false;
    }
  }, [status.didJustFinish, player, stopSound]);

  const stop = () => {
    player.pause();
    void player.seekTo(0);
    if (alongside.current) {
      stopSound();
      alongside.current = false;
    }
  };

  const play = async (withSound: boolean) => {
    await setRecordingMode(false);
    await player.seekTo(0);
    if (withSound && recording.setting) {
      if (!(await startSoundOf(recording.setting))) return;
      alongside.current = true;
    }
    player.play();
  };

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <AppText variant="label">
        {t('recordMyself.recordedAt', { date: formatDateTimeInIndia(recording.recordedAt), time: durationText(recording.durationMs) })}
      </AppText>
      <AppText variant="small" tone="muted">
        {settingText}
      </AppText>
      <View style={styles.actions}>
        {status.playing ? (
          <Button variant="secondary" icon="pause" label={t('recording.stopPlaying')} onPress={stop} />
        ) : (
          <>
            <Button variant="secondary" icon="play" label={t('recording.play')} onPress={() => void play(false)} />
            {recording.setting ? (
              <Button variant="secondary" icon="instruments" label={t('recordMyself.playWithSound')} onPress={() => void play(true)} />
            ) : null}
          </>
        )}
        {asking ? (
          <>
            <Button icon="delete" label={t('recordMyself.deleteSure')} onPress={() => void onDelete()} />
            <Button variant="link" label={t('syllabusEditor.cancel')} onPress={() => setAsking(false)} />
          </>
        ) : (
          <Button variant="link" icon="delete" label={t('recordMyself.delete')} onPress={() => setAsking(true)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
