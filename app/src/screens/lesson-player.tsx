// V3 Lesson-video player (Phase 2 slice 4, docs/DECISIONS.md #56), for students (route
// student/lesson/[id]) and staff (staff/lesson/[id]); the id is a material's.
// - Every lesson video: play / pause, back and forward 5 s, speed 0.5x / 0.75x / 1x, an A-B loop
//   (set A and B while it plays; the part repeats until cleared).
// - The team's own video file only (materials kind 'video'): mirror (see it as the player sees it;
//   also for left-handed students) and, for a video with camera angles side by side (V2), zoom one
//   pane (tap it on the video, or pick it here). YouTube's terms allow no change to its player's
//   picture, so a YouTube lesson says so and offers "Open in YouTube".
// The video plays in a page of its own (lib/lesson-player-html.ts) inside a WebView on phones
// (react-native-webview, next planned APK) or an iframe in the browser; the controls are the app's,
// under the video (nothing may be drawn over YouTube's player).

import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { LessonVideoFrame, type LessonVideoFrameHandle } from '@/components/lesson-video-frame';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchMaterial, lessonSourceOf, type Material } from '@/data/materials';
import type { PlayerCommand, PlayerEvent } from '@/lib/lesson-player-html';
import { maxDashboardWidth, spacing, useTheme } from '@/theme/use-theme';

/** YouTube's embedded player must be at least 200 x 200 px (its required minimum functionality). */
const MIN_YOUTUBE_HEIGHT = 200;
const SPEEDS = [0.5, 0.75, 1];
/** The 'All' choice of the camera-angle chips. */
const ALL_PANES = -1;

/** 83.4 → "1:23"; with tenths (loop points, often a second apart) "1:23.4". */
export function clockText(seconds: number, tenths = false): string {
  const whole = Math.max(0, Math.floor(seconds));
  const base = `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  return tenths ? `${base}.${Math.floor((Math.max(0, seconds) * 10) % 10)}` : base;
}

/** The lesson-video player screen. */
export function LessonPlayer() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const window = useWindowDimensions();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const [loaded, setLoaded] = useState<Material | 'not_found' | null | undefined>(undefined);
  const frame = useRef<LessonVideoFrameHandle>(null);
  const [width, setWidth] = useState(0);
  const [aspect, setAspect] = useState(16 / 9);
  const [ready, setReady] = useState(false);
  const [rates, setRates] = useState<number[]>([]);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [pane, setPane] = useState<number | null>(null);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoaded(await fetchMaterial(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Leaving the screen stops the video (YouTube's terms: no playing from a player not on screen).
      return () => frame.current?.send({ cmd: 'pause' });
    }, [load]),
  );

  const material = loaded && loaded !== 'not_found' ? loaded : null;
  const source = material ? lessonSourceOf(material) : null;
  const isFile = source?.kind === 'file';
  const panes = source?.kind === 'file' ? source.panes : 1;

  const onEvent = useCallback(
    (event: PlayerEvent) => {
      if (event.event === 'ready') {
        setReady(true);
        setRates(event.rates);
        setDuration(event.duration);
      } else if (event.event === 'state') {
        setTime(event.time);
        setDuration(event.duration);
        setPlaying(event.playing);
      } else if (event.event === 'aspect') {
        if (event.ratio > 0) setAspect(event.ratio);
      } else if (event.event === 'zoom') {
        setPane(event.pane);
      } else if (event.event === 'error') {
        setError(
          event.code === 'rate_unavailable'
            ? t('lessonPlayer.errors.rate')
            : event.code === 'youtube_101' || event.code === 'youtube_150'
              ? t('lessonPlayer.errors.notEmbeddable')
              : event.code === 'play_blocked'
                ? t('lessonPlayer.errors.playBlocked')
                : event.code === 'offline'
                  ? t('common.networkError')
                  : t('lessonPlayer.errors.cannotPlay'),
        );
      }
    },
    [t],
  );

  const header = <Stack.Screen options={{ title: material?.title ?? t('lessonPlayer.title') }} />;

  if (!material || !source) {
    return (
      <Screen underHeader centred>
        {header}
        {loaded === undefined ? <LoadingCards /> : null}
        {loaded === 'not_found' || (material && !source) ? <Notice tone="error">{t('lessonPlayer.notFound')}</Notice> : null}
        {loaded === null ? (
          <>
            <Notice tone="error">{t('common.networkError')}</Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  // A file keeps its own shape (one pane's when zoomed), at most 70 % of the window high, centred;
  // YouTube is 16:9 and at least 200 px high.
  // The box's width from onLayout; until it reports (react-native-web sometimes does not on a
  // direct load), the window's width less the page margins.
  const boxWidth = width > 0 ? width : Math.max(200, Math.min(window.width - 48, maxDashboardWidth));
  const maxFileHeight = Math.max(MIN_YOUTUBE_HEIGHT, Math.round(window.height * 0.7));
  const fileHeight = Math.min(Math.round(boxWidth / aspect), maxFileHeight);
  const height = isFile ? fileHeight : Math.max(MIN_YOUTUBE_HEIGHT, Math.round((boxWidth * 9) / 16));
  const frameWidth = isFile ? Math.min(boxWidth, Math.round(fileHeight * aspect)) : boxWidth;
  const send = (command: PlayerCommand) => frame.current?.send(command);

  const changeSpeed = (value: number) => {
    setError(null);
    setSpeed(value);
    send({ cmd: 'rate', value });
  };
  const changeMirror = (value: boolean) => {
    setMirror(value);
    send({ cmd: 'mirror', value });
  };
  const changePane = (value: number | null) => {
    setPane(value);
    send({ cmd: 'zoom', value });
  };
  const setA = () => {
    const a = time;
    setLoopA(a);
    // A new A after B starts the loop afresh.
    const b = loopB !== null && loopB > a + 0.2 ? loopB : null;
    setLoopB(b);
    send({ cmd: 'loop', value: b !== null ? { a, b } : null });
  };
  const setB = () => {
    if (loopA === null || time <= loopA + 0.2) {
      setError(t('lessonPlayer.loopBAfterA'));
      return;
    }
    setError(null);
    setLoopB(time);
    send({ cmd: 'loop', value: { a: loopA, b: time } });
  };
  const clearLoop = () => {
    setLoopA(null);
    setLoopB(null);
    send({ cmd: 'loop', value: null });
  };

  return (
    <Screen underHeader wide>
      {header}
      <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={styles.frameBox}>
        <View style={{ width: frameWidth, maxWidth: '100%' }}>
          <LessonVideoFrame ref={frame} source={source} height={height} background={colors.background} onEvent={onEvent} />
        </View>
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <View style={styles.row}>
        <Button
          icon={playing ? 'pause' : 'play'}
          label={playing ? t('lessonPlayer.pause') : t('lessonPlayer.play')}
          disabled={!ready}
          onPress={() => send({ cmd: playing ? 'pause' : 'play' })}
        />
        <Button variant="secondary" label={t('lessonPlayer.back5')} disabled={!ready} onPress={() => send({ cmd: 'seek', value: Math.max(0, time - 5) })} />
        <Button variant="secondary" label={t('lessonPlayer.forward5')} disabled={!ready} onPress={() => send({ cmd: 'seek', value: time + 5 })} />
      </View>
      <AppText tone="muted" accessibilityLiveRegion="none">
        {ready ? `${clockText(time)} / ${clockText(duration)}` : t('lessonPlayer.loading')}
      </AppText>

      <Section icon="time" title={t('lessonPlayer.speed')}>
        <ChoiceGroup<number>
          chips
          label={t('lessonPlayer.speed')}
          value={speed}
          onChange={changeSpeed}
          choices={SPEEDS.filter((s) => rates.length === 0 || rates.includes(s)).map((s) => ({ value: s, label: `${s}x` }))}
        />
      </Section>

      <Section icon="loop" title={t('lessonPlayer.loopTitle')} description={t('lessonPlayer.loopHint')}>
        <View style={styles.row}>
          <Button variant="secondary" label={t('lessonPlayer.setA')} disabled={!ready} onPress={setA} />
          <Button variant="secondary" label={t('lessonPlayer.setB')} disabled={!ready || loopA === null} onPress={setB} />
          {loopA !== null ? <Button variant="link" label={t('lessonPlayer.clearLoop')} onPress={clearLoop} /> : null}
        </View>
        {loopA !== null ? (
          <AppText variant="label">
            {loopB !== null
              ? t('lessonPlayer.looping', { a: clockText(loopA, true), b: clockText(loopB, true) })
              : t('lessonPlayer.aSet', { a: clockText(loopA, true) })}
          </AppText>
        ) : null}
      </Section>

      <Section icon="mirror" title={t('lessonPlayer.viewTitle')}>
        {isFile ? (
          <>
            <ChoiceGroup<'filmed' | 'mirrored'>
              chips
              label={t('lessonPlayer.mirror')}
              value={mirror ? 'mirrored' : 'filmed'}
              onChange={(value) => changeMirror(value === 'mirrored')}
              choices={[
                { value: 'filmed', label: t('lessonPlayer.asFilmed') },
                { value: 'mirrored', label: t('lessonPlayer.mirrored') },
              ]}
            />
            <AppText variant="small" tone="muted">
              {t('lessonPlayer.mirrorHint')}
            </AppText>
            {panes > 1 ? (
              <>
                <ChoiceGroup<number>
                  chips
                  label={t('lessonPlayer.zoom')}
                  value={pane ?? ALL_PANES}
                  onChange={(value) => changePane(value === ALL_PANES ? null : value)}
                  choices={[
                    { value: ALL_PANES, label: t('lessonPlayer.allPanes') },
                    ...Array.from({ length: panes }, (_, i) => ({ value: i, label: t('lessonPlayer.pane', { n: i + 1 }) })),
                  ]}
                />
                <AppText variant="small" tone="muted">
                  {t('lessonPlayer.zoomHint')}
                </AppText>
              </>
            ) : null}
          </>
        ) : (
          <>
            <AppText tone="muted">{t('lessonPlayer.youtubeNoMirror')}</AppText>
            {material.url ? (
              <Button variant="link" icon="open" label={t('lessonPlayer.openYouTube')} onPress={() => void Linking.openURL(material.url ?? '')} />
            ) : null}
          </>
        )}
      </Section>

      {material.body ? <AppText>{material.body}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frameBox: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
