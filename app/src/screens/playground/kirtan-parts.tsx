// The kīrtan games' listening panel (docs/RHYTHM_PLAYGROUND.md §7.7, §7.14; docs/DECISIONS.md #762, #765): plays the
// clip only after a tap, shows the beat hints the step allows (every beat with sam marked, only sam, or none), and
// takes the student's taps on the clip's own clock — "Tap the beat" (pulse, practice) and "The khol starts here"
// (entry). The phone's measured delay ("Tune to this phone", #470) is taken off; untuned phones say so.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { tapOffset, tapTuned } from '@/lib/play-bests';
import { beatAt, type KirtanGrid } from '@/lib/playground/beat-grid';
import type { ClipPlayer, ClipSource } from '@/lib/playground/clip-player';
import { radius, spacing, useTheme } from '@/theme/use-theme';

export type Hints = 'all' | 'sam' | 'none';

/** What the student tapped while the clip played (player-clock ms, the phone's delay not yet taken off). */
export type KirtanTaps = { pulse: number[]; entry: number | null };

export type KirtanPanelProps = {
  player: ClipPlayer;
  source: ClipSource | null;
  grid: KirtanGrid | null;
  hints: Hints;
  /** Which tap buttons to show. */
  pulse: boolean;
  entry: boolean;
  /** The clip stopped (end, or Stop) with these taps. */
  onDone: (taps: KirtanTaps) => void;
};

/** The phone's delay to take off taps, and whether it was measured. */
export function tapDelay(): { offsetMs: number; calibrated: boolean } {
  return { offsetMs: tapOffset(), calibrated: tapTuned() };
}

export function KirtanPanel({ player, source, grid, hints, pulse, entry, onDone }: KirtanPanelProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState(0);
  const taps = useRef<KirtanTaps>({ pulse: [], entry: null });
  const [entryTapped, setEntryTapped] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setPos(player.positionMs()), 50);
    return () => clearInterval(timer);
  }, [playing, player]);

  useEffect(() => {
    player.onEnd(() => {
      setPlaying(false);
      done.current({ ...taps.current, pulse: [...taps.current.pulse] });
    });
    return () => player.onEnd(null);
  }, [player]);

  const start = async () => {
    if (!source) return;
    taps.current = { pulse: [], entry: null };
    setEntryTapped(false);
    const ok = await player.play(source);
    setFailed(!ok);
    setPlaying(ok);
  };
  const stop = () => {
    player.stop();
    setPlaying(false);
    done.current({ ...taps.current, pulse: [...taps.current.pulse] });
  };

  const where = grid && playing ? beatAt(grid, pos - tapOffset()) : null;
  const hint =
    !where || hints === 'none' ? '' : hints === 'sam' ? (where.sam ? t('playground.kirtan.sam') : '') : where.sam ? t('playground.kirtan.samBeat') : String(where.beat);

  return (
    <View style={styles.column}>
      {failed ? <Notice tone="error">{t('playground.round.soundFailed')}</Notice> : null}
      {!source ? <Notice tone="info">{t('playground.kirtan.noClip')}</Notice> : null}
      {playing ? (
        <>
          <View
            accessibilityLiveRegion="polite"
            style={[styles.hint, { borderColor: where?.sam && hints !== 'none' ? colors.accent : colors.border }]}
          >
            <AppText variant="subtitle">{hint || ' '}</AppText>
            {where && hints !== 'none' ? (
              <AppText variant="small" tone="muted">
                {t('playground.kirtan.cycle', { n: where.cycle + 1 })}
              </AppText>
            ) : null}
          </View>
          {pulse ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('playground.kirtan.tapBeat')}
              onPressIn={() => taps.current.pulse.push(player.positionMs())}
              style={({ pressed }) => [styles.pad, { backgroundColor: pressed ? colors.accent : colors.surface, borderColor: colors.primary }]}
            >
              <AppText variant="subtitle">{t('playground.kirtan.tapBeat')}</AppText>
            </Pressable>
          ) : null}
          {entry ? (
            <Button
              size="large"
              icon="drum"
              label={entryTapped ? t('playground.kirtan.entryTapped') : t('playground.kirtan.tapEntry')}
              onPress={() => {
                taps.current.entry = player.positionMs();
                setEntryTapped(true);
              }}
            />
          ) : null}
          <Button variant="secondary" icon="pause" label={t('playground.kirtan.stop')} onPress={stop} />
        </>
      ) : (
        <Button size="large" icon="play" label={t('playground.kirtan.play')} onPress={() => void start()} disabled={!source} />
      )}
      {!tapTuned() ? (
        <AppText variant="small" tone="muted">
          {t('playground.kirtan.notTuned')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: spacing.sm },
  hint: { borderWidth: 2, borderRadius: radius, padding: spacing.sm, alignItems: 'center', minHeight: 72 },
  pad: { borderWidth: 2, borderRadius: radius, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
});
