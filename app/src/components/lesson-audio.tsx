// The Audio tab of a lesson (0064, docs/DECISIONS.md #683-#685): the lesson's own audio file from the private
// bucket material-files, through a signed link made only when the tab is first opened (#684: nothing loads from a
// tab nobody opened). Play / Pause, back and forward 5 s, the time, and speed 0.75x / 1x for practising along.
// Never plays by itself; leaving the tab (or the screen) pauses it. Repeat plays it round and round (#786).
// expo-audio, as the recorder's PlayButton (components/audio-recorder.tsx).

import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { lessonAudioLink } from '@/data/materials';
import { setRecordingMode } from '@/lib/recording';
import { spacing } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { ChoiceGroup } from './choice-group';
import { Notice } from './notice';

const SPEEDS = [0.75, 1];

/** 83.4 → "1:23". */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Props for LessonAudio. */
export type LessonAudioProps = {
  path: string;
  name: string | null;
  /** Its tab is shown (and, on the chapter screen, no other medium took over); when it turns false the audio pauses. */
  active: boolean;
  /** Called when it starts playing, so the screen can pause its other media (the chapter screen, #786). */
  onPlay?: () => void;
};

/** The lesson's audio. */
export function LessonAudio({ path, name, active, onPlay }: LessonAudioProps) {
  const { t } = useTranslation();
  // undefined = making the link, null = could not (usually no internet).
  const [uri, setUri] = useState<string | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void lessonAudioLink(path).then((link) => {
      if (!cancelled) setUri(link);
    });
    return () => {
      cancelled = true;
    };
  }, [path, attempt]);

  if (uri === undefined) return <AppText tone="muted">{t('lessonPlayer.audioLoading')}</AppText>;
  if (uri === null) {
    return (
      <>
        <Notice tone="error">{t('common.networkError')}</Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => {
            setUri(undefined);
            setAttempt((n) => n + 1);
          }} />
      </>
    );
  }
  return <AudioControls uri={uri} name={name} active={active} onPlay={onPlay} />;
}

function AudioControls({ uri, name, active, onPlay }: Omit<LessonAudioProps, 'path'> & { uri: string }) {
  const { t } = useTranslation();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState(1);
  const [repeat, setRepeat] = useState(false);

  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  useEffect(() => {
    if (status.playing) onPlay?.();
    // Only a start of playing tells the screen; a new onPlay from a re-render does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.playing]);

  useEffect(() => {
    // At the end, back to the start so Play plays it again; with Repeat on, it plays again at once.
    if (!status.didJustFinish) return;
    void player.seekTo(0).then(() => {
      if (repeat) player.play();
    });
  }, [status.didJustFinish, player, repeat]);

  const ready = status.isLoaded;
  return (
    <View style={styles.box}>
      {name ? <AppText variant="label">{name}</AppText> : null}
      <View style={styles.row}>
        <Button
          icon={status.playing ? 'pause' : 'play'}
          label={status.playing ? t('lessonPlayer.pause') : t('lessonPlayer.play')}
          disabled={!ready}
          onPress={() => {
            if (status.playing) player.pause();
            else void setRecordingMode(false).then(() => player.play());
          }}
        />
        <Button variant="secondary" label={t('lessonPlayer.back5')} disabled={!ready} onPress={() => void player.seekTo(Math.max(0, status.currentTime - 5))} />
        <Button variant="secondary" label={t('lessonPlayer.forward5')} disabled={!ready} onPress={() => void player.seekTo(status.currentTime + 5)} />
      </View>
      <AppText tone="muted" accessibilityLiveRegion="none">
        {ready ? `${clock(status.currentTime)} / ${clock(status.duration)}` : t('lessonPlayer.audioLoading')}
      </AppText>
      <ChoiceGroup<number>
        chips
        label={t('lessonPlayer.speed')}
        value={speed}
        onChange={(value) => {
          setSpeed(value);
          player.setPlaybackRate(value);
        }}
        choices={SPEEDS.map((s) => ({ value: s, label: `${s}x` }))}
      />
      {/* Repeat (#786): the whole audio again and again, to play along without touching the phone. */}
      <Checkbox
        label={t('lessonPlayer.repeat')}
        checked={repeat}
        onChange={setRepeat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
