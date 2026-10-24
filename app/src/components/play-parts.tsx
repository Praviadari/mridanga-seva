// Parts of the creative practice tools (docs/DECISIONS.md #470-#474), shared by the tap pad, Which bol? and Echo me:
// - TapPads: two big pads, the baya's on the left and the dayan's on the right, each a drum face with the hand that
//   plays it (components/hand-view.tsx), lit for the stroke being played when the guide is on, and how the last tap
//   was graded under it (on time / early / late / extra tap).
// - TempoStepper: the tempo with −5 −1 +1 +5 (set before Start; the game keeps one tempo while it plays).
// - TaalChips: the taals to choose from.
// - CycleStars: the stars of the last cycles, and the best kept on this phone.
// - TuneLine: "Tune to this phone", which measures the phone's delay between a tap and its sound once.

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { Taal } from '@/data/practice';
import type { Stroke } from '@/lib/bols';
import { clampBpm, metronomePattern, MAX_BPM, MIN_BPM } from '@/lib/practice-pattern';
import type { PracticePlayer } from '@/lib/practice-player';
import { saveTapOffset, tapTuned, type TapBest } from '@/lib/play-bests';
import { BeatClock, beatErrorMs, calibrationOffset, type CycleScore, type PadHand } from '@/lib/tap-grading';
import type { PadFeedback } from '@/lib/use-tap-game';
import { cardRadius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { ChoiceGroup } from './choice-group';
import { HAND_LIT, HandDrawing } from './hand-view';
import { Notice } from './notice';

/** The pad's drum face: the same in light and dark mode, like the drum on Practice tools (two-head-view.tsx). */
const FACE = { rim: '#6B4A2B', head: '#EADBB8', syahi: '#2B2622' };

/** Props for TapPads. */
export type TapPadsProps = {
  onTap: (hand: PadHand) => void;
  /** The stroke each hand plays now (the guide), or null. */
  guide: Record<PadHand, Stroke | null>;
  /** True just after the stroke starts: the guide is lit brightly. */
  fresh: boolean;
  feedback: Record<PadHand, PadFeedback>;
};

/** The two pads side by side. Each reacts the moment a finger touches it (not on lifting it). */
export function TapPads({ onTap, guide, fresh, feedback }: TapPadsProps) {
  return (
    <View style={styles.pads}>
      <Pad hand="left" onTap={onTap} stroke={guide.left} fresh={fresh} feedback={feedback.left} />
      <Pad hand="right" onTap={onTap} stroke={guide.right} fresh={fresh} feedback={feedback.right} />
    </View>
  );
}

function Pad({ hand, onTap, stroke, fresh, feedback }: { hand: PadHand; onTap: (hand: PadHand) => void; stroke: Stroke | null; fresh: boolean; feedback: PadFeedback }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lit = stroke !== null && fresh;
  // A short flash on each tap (the browser's pointer input has no pressed state of its own).
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  const tap = () => {
    onTap(hand);
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 120);
  };
  // The baya is the big bass head: its face is drawn larger, its black centre off to one side.
  const face = hand === 'left' ? 0.86 : 0.7;
  return (
    <View style={styles.padColumn}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(hand === 'left' ? 'play.padLeft' : 'play.padRight')}
        accessibilityHint={t('play.padHint')}
        // The moment the finger lands: a pointer down in the browser (each finger its own, so both pads at once), the
        // responder's press-in on phones.
        {...(Platform.OS === 'web' ? { onPointerDown: tap } : { onPressIn: tap })}
        style={({ pressed: held }) => {
          const pressed = held || flash;
          return [
            styles.pad,
            {
              backgroundColor: colors.surfaceSunken,
              borderColor: pressed ? HAND_LIT : lit ? colors.accent : colors.cardBorder,
              borderWidth: pressed || lit ? 4 : 2,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
          ];
        }}
      >
        <View aria-hidden style={[styles.face, { width: `${face * 100}%`, borderColor: FACE.rim, backgroundColor: FACE.head }]}>
          <View
            style={[
              styles.syahi,
              { backgroundColor: lit ? HAND_LIT : FACE.syahi },
              hand === 'left' ? styles.syahiBaya : null,
            ]}
          />
        </View>
        <View aria-hidden style={styles.hand}>
          <HandDrawing side={hand} stroke={stroke} fresh={fresh} />
        </View>
        <AppText variant="label" style={styles.padLabel}>
          {t(hand === 'left' ? 'play.padLeftShort' : 'play.padRightShort')}
        </AppText>
      </Pressable>
      <FeedbackText feedback={feedback} />
    </View>
  );
}

/** How the last tap on a pad was graded, in words and colour; read out to screen readers. */
function FeedbackText({ feedback }: { feedback: PadFeedback }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const grade = feedback?.grade;
  const color = grade === 'onTime' ? colors.success : grade === 'early' || grade === 'late' ? colors.warning : colors.textMuted;
  return (
    <View style={styles.feedback} accessibilityLiveRegion="polite">
      <AppText variant="label" style={{ color, textAlign: 'center' }}>
        {grade ? t(`play.grade.${grade}`) : ' '}
      </AppText>
    </View>
  );
}

/** Props for TempoStepper. */
export type TempoStepperProps = { bpm: number; onChange: (bpm: number) => void; disabled?: boolean };

/** The tempo and −5 −1 +1 +5. */
export function TempoStepper({ bpm, onChange, disabled }: TempoStepperProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.tempo}>
      <View style={styles.tempoValue} accessible accessibilityLabel={t('practice.bpmLabel', { bpm })} accessibilityLiveRegion="polite">
        <AppText variant="title" family="sans">{bpm}</AppText>
        <AppText tone="muted">{t('practice.bpm', { min: MIN_BPM, max: MAX_BPM })}</AppText>
      </View>
      <View style={styles.steps}>
        {[-5, -1, 1, 5].map((by) => (
          <View key={by} style={styles.step}>
            <Button
              variant="secondary"
              label={by > 0 ? `+${by}` : `−${-by}`}
              accessibilityLabel={by > 0 ? t('practice.tempoFaster', { by }) : t('practice.tempoSlower', { by: -by })}
              disabled={disabled || (by < 0 && bpm <= MIN_BPM) || (by > 0 && bpm >= MAX_BPM)}
              onPress={() => onChange(clampBpm(bpm + by))}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Props for TaalChips. */
export type TaalChipsProps = { taals: readonly Taal[]; value: number | null; onChange: (id: number) => void };

/** The taals to choose from, by name and beats. */
export function TaalChips({ taals, value, onChange }: TaalChipsProps) {
  const { t } = useTranslation();
  return (
    <ChoiceGroup<number>
      chips
      label={t('practice.taal')}
      value={value}
      onChange={onChange}
      choices={taals.map((tl) => ({ value: tl.id, label: t('practice.taalChoice', { name: tl.name, beats: tl.beats }) }))}
    />
  );
}

/** "★★☆": filled stars of three. */
export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
}

/** Props for CycleStars. */
export type CycleStarsProps = { scores: readonly CycleScore[]; best: TapBest | null; newBest: boolean; unit: 'cycle' | 'round' };

/** The last cycles' stars (newest first, with what made them) and the best on this phone. */
export function CycleStars({ scores, best, newBest, unit }: CycleStarsProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const last = scores[scores.length - 1];
  return (
    <View style={styles.stars}>
      {last ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={t('play.cycleSaid', { n: last.cycle + 1, stars: last.stars })}>
          <AppText variant="number" style={{ color: colors.accent, textAlign: 'center' }}>
            {starText(last.stars)}
          </AppText>
          <AppText variant="small" tone="muted" style={styles.centre}>
            {t(unit === 'cycle' ? 'play.cycleCount' : 'play.roundCount', {
              n: last.cycle + 1,
              onTime: last.onTime,
              close: last.close,
              missed: last.missed,
            })}
            {last.stray > 0 ? ` · ${t('play.strayCount', { count: last.stray })}` : ''}
          </AppText>
        </View>
      ) : (
        <AppText variant="small" tone="muted" style={styles.centre}>
          {t(unit === 'cycle' ? 'play.starsAfterCycle' : 'play.starsAfterRound')}
        </AppText>
      )}
      {scores.length > 1 ? (
        <AppText variant="small" tone="muted" style={styles.centre} accessibilityLabel={t('play.earlierStars')}>
          {scores
            .slice(0, -1)
            .map((s) => starText(s.stars))
            .join('  ')}
        </AppText>
      ) : null}
      {newBest ? <Notice tone="success">{t('play.newBest')}</Notice> : null}
      <AppText variant="small" tone="muted" style={styles.centre}>
        {best ? t('play.best', { stars: starText(best.stars), bpm: best.bpm }) : t('play.noBest')}
      </AppText>
    </View>
  );
}

/** Props for TuneLine. */
export type TuneLineProps = {
  player: PracticePlayer;
  /** The game's sound is playing: tuning waits. */
  busy: boolean;
  onTuning: (tuning: boolean) => void;
};

/** Clicks for tuning: 12 at 80 beats a minute, after a bar of count-in. */
const TUNE_BPM = 80;
const TUNE_CLICKS = 12;

/**
 * "Tune to this phone": 12 clicks at 80 beats a minute; the student taps either pad with each. The middle value of how
 * late the taps were is the phone's delay, kept on this phone and taken off every tap after (lib/tap-grading.ts).
 */
export function TuneLine({ player, busy, onTuning }: TuneLineProps) {
  const { t } = useTranslation();
  const [tuning, setTuning] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [tuned, setTuned] = useState(tapTuned);
  const errors = useRef<number[]>([]);
  const clock = useRef<BeatClock | null>(null);
  const done = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (done.current) clearTimeout(done.current);
  }, []);

  const finish = () => {
    player.stop();
    setTuning(false);
    onTuning(false);
    const found = calibrationOffset(errors.current);
    if (!found) {
      setResult({ tone: 'warning', text: t('play.tuneUneven') });
      return;
    }
    saveTapOffset(found.offsetMs);
    setTuned(true);
    setResult({ tone: 'success', text: t('play.tuneDone', { ms: found.offsetMs }) });
  };

  const start = async () => {
    errors.current = [];
    clock.current = new BeatClock(4);
    setResult(null);
    const ok = await player.start(metronomePattern(4), TUNE_BPM, 4);
    // The loop goes on past the clicks counted; the timer below stops it.
    if (!ok) {
      setResult({ tone: 'warning', text: t('practice.soundFailed') });
      return;
    }
    setTuning(true);
    onTuning(true);
    // The count-in and the clicks, then the result.
    done.current = setTimeout(finish, ((4 + TUNE_CLICKS) * 60000) / TUNE_BPM + 300);
  };

  const tap = () => {
    const position = player.position();
    if (!position || !clock.current) return;
    errors.current.push(beatErrorMs(clock.current.next(position), TUNE_BPM));
  };

  return (
    <View style={styles.tune}>
      {tuning ? (
        <>
          <AppText variant="label">{t('play.tuneNow', { clicks: TUNE_CLICKS })}</AppText>
          <TapPads onTap={tap} guide={{ left: null, right: null }} fresh={false} feedback={{ left: null, right: null }} />
        </>
      ) : (
        <>
          <AppText variant="small" tone="muted">
            {tuned ? t('play.tuned') : t('play.notTuned')}
          </AppText>
          <Button variant="secondary" icon="tap" label={t('play.tune')} disabled={busy} onPress={() => void start()} />
        </>
      )}
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pads: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  padColumn: {
    flex: 1,
    gap: spacing.xs,
  },
  pad: {
    flexGrow: 1,
    minHeight: 200,
    borderRadius: cardRadius,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  face: {
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syahi: {
    width: '40%',
    aspectRatio: 1,
    borderRadius: 999,
  },
  syahiBaya: {
    // The baya's black patch sits off the centre, towards the player.
    marginTop: '20%',
  },
  hand: {
    width: '60%',
    maxWidth: 90,
    aspectRatio: 1,
  },
  padLabel: {
    textAlign: 'center',
  },
  feedback: {
    minHeight: 24,
  },
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
  stars: {
    gap: spacing.xs,
  },
  centre: {
    textAlign: 'center',
  },
  tune: {
    gap: spacing.sm,
  },
});
