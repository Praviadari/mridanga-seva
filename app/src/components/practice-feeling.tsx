// "How did it go?" after a practice session (docs/DECISIONS.md #494, migration 0056): three faces (hard, okay, good)
// and what was practised (taal, lesson, free), saved with that practice entry; staff see it (the practice panel on the
// student's profile, the practice-this-week list). Always optional: Skip is one tap, and nothing is asked again.
// - FeelingFace: one face, drawn (no emoji, so it looks the same on every phone and follows the theme).
// - FeelingFields: the faces and the practised chips, for a form (Add practice in the log).
// - FeelingPrompt: the card under the timer after Stop and save; tapping a face saves at once.
// - feelingWords / FeelingCounts: what was said about one session in words; how sessions went, counted.

import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { FEELINGS, PRACTISED_KINDS, setPracticeFeeling, type Feeling, type Practised } from '@/data/practice';
import { spaceKeyProps } from '@/lib/space-key';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';

/** The words of the faces and chips, as i18n keys. */
const FEELING_KEY = { 1: 'practiceExtras.feelingHard', 2: 'practiceExtras.feelingOkay', 3: 'practiceExtras.feelingGood' } as const;
const PRACTISED_KEY = { taal: 'practiceExtras.practisedTaal', lesson: 'practiceExtras.practisedLesson', free: 'practiceExtras.practisedFree' } as const;

/** The mouth of each face: down, flat, up. */
const MOUTH: Record<Feeling, string> = {
  1: 'M15 33 Q24 26 33 33',
  2: 'M15 31 L33 31',
  3: 'M14 28 Q24 38 34 28',
};

/** One face, `size` across, drawn in `color` (filled with `fill` when chosen). */
export function FeelingFace({ feeling, size = 40, color, fill }: { feeling: Feeling; size?: number; color: string; fill?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <Circle cx={24} cy={24} r={21} stroke={color} strokeWidth={3} fill={fill ?? 'none'} />
      <Circle cx={17} cy={19} r={2.6} fill={color} />
      <Circle cx={31} cy={19} r={2.6} fill={color} />
      <Path d={MOUTH[feeling]} stroke={color} strokeWidth={3} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Props for FeelingFields. */
export type FeelingFieldsProps = {
  feeling: Feeling | null;
  onFeeling: (feeling: Feeling | null) => void;
  practised: readonly Practised[];
  onPractised: (practised: Practised[]) => void;
};

/** The three faces (a radio group; tapping the chosen one again clears it) and the practised chips. */
export function FeelingFields({ feeling, onFeeling, practised, onPractised }: FeelingFieldsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <FaceRow value={feeling} onChange={(f) => onFeeling(f === feeling ? null : f)} label={t('practiceExtras.feelingQuestion')} />
      <PractisedChips value={practised} onChange={onPractised} />
    </View>
  );
}

/** The faces as one radio group, each at least 64 px wide with its word under it. */
function FaceRow({ value, onChange, label }: { value: Feeling | null; onChange: (f: Feeling) => void; label: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.faces} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {FEELINGS.map((f) => {
          const on = value === f;
          return (
            <Pressable
              key={f}
              accessibilityRole="radio"
              aria-checked={on}
              accessibilityLabel={t(FEELING_KEY[f])}
              onPress={() => onChange(f)}
              {...spaceKeyProps(() => onChange(f))}
              style={({ pressed }) => [
                styles.face,
                { borderColor: on ? colors.primary : colors.controlBorder, backgroundColor: on ? colors.primarySoft : colors.surface },
                pressed && { backgroundColor: colors.pressedOverlay },
              ]}>
              <FeelingFace feeling={f} color={on ? colors.onPrimarySoft : colors.primary} />
              <AppText variant="small" style={{ color: on ? colors.onPrimarySoft : colors.text }}>
                {t(FEELING_KEY[f])}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "What did you practise?": taal, lesson, free, any of them (tick chips). */
function PractisedChips({ value, onChange }: { value: readonly Practised[]; onChange: (p: Practised[]) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const toggle = (kind: Practised) =>
    onChange(PRACTISED_KINDS.filter((k) => (k === kind ? !value.includes(k) : value.includes(k))));
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{t('practiceExtras.practisedQuestion')}</AppText>
      <View style={styles.chips}>
        {PRACTISED_KINDS.map((kind) => {
          const on = value.includes(kind);
          return (
            <Pressable
              key={kind}
              accessibilityRole="checkbox"
              aria-checked={on}
              accessibilityLabel={t(PRACTISED_KEY[kind])}
              onPress={() => toggle(kind)}
              {...spaceKeyProps(() => toggle(kind))}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: on ? colors.primary : colors.controlBorder, backgroundColor: on ? colors.primary : colors.surface },
                pressed && !on && { backgroundColor: colors.pressedOverlay },
              ]}>
              <AppText variant="label" style={{ color: on ? colors.onPrimary : colors.text }}>
                {t(PRACTISED_KEY[kind])}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Props for FeelingPrompt. */
export type FeelingPromptProps = {
  /** The practice entry just saved. */
  entryId: number;
  /** Chips ticked at first (the timer played a taal). */
  initial: readonly Practised[];
  /** The card is done with (skipped, or Done after saving). */
  onClose: () => void;
};

/**
 * Under the timer after Stop and save: "How did it go?". A face saves at once (with the chips ticked so far); a chip
 * changed after that saves again. Skip closes it without saving anything.
 */
export function FeelingPrompt({ entryId, initial, onClose }: FeelingPromptProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [practised, setPractised] = useState<Practised[]>([...initial]);
  const [state, setState] = useState<'asking' | 'saving' | 'saved' | 'failed'>('asking');

  const save = async (f: Feeling | null, p: Practised[]) => {
    setState('saving');
    const errorKey = await setPracticeFeeling(entryId, f, p);
    setState(errorKey ? 'failed' : 'saved');
  };

  return (
    <View style={[styles.card, { borderColor: colors.cardBorder, backgroundColor: colors.surface }]}>
      <FaceRow
        value={feeling}
        label={t('practiceExtras.feelingQuestion')}
        onChange={(f) => {
          setFeeling(f);
          void save(f, practised);
        }}
      />
      <PractisedChips
        value={practised}
        onChange={(p) => {
          setPractised(p);
          if (feeling !== null) void save(feeling, p);
        }}
      />
      {state === 'saved' ? <Notice tone="success">{t('practiceExtras.feelingSaved')}</Notice> : null}
      {state === 'failed' ? <Notice tone="error">{t('practiceExtras.feelingFailed')}</Notice> : null}
      {feeling === null ? (
        <Button variant="link" label={t('practiceExtras.feelingSkip')} onPress={onClose} />
      ) : (
        <Button variant="secondary" icon="check" label={t('practiceExtras.feelingDone')} loading={state === 'saving'} onPress={onClose} />
      )}
    </View>
  );
}

/** "Good · Taal · Lesson": what was said about a session, or null when nothing was. */
export function feelingWords(t: TFunction, feeling: Feeling | null, practised: readonly Practised[] | null): string | null {
  const words = [feeling ? t(FEELING_KEY[feeling]) : null, ...(practised ?? []).map((p) => t(PRACTISED_KEY[p]))].filter(Boolean);
  return words.length > 0 ? words.join(' · ') : null;
}

/** "Good 3 · Okay 1 · Hard 0": how sessions went, for staff and the student; nothing when none was said. */
export function FeelingCounts({ hard, okay, good }: { hard: number; okay: number; good: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (hard + okay + good === 0) return null;
  const parts: [Feeling, number][] = [
    [3, good],
    [2, okay],
    [1, hard],
  ];
  return (
    <View
      style={styles.counts}
      accessible
      accessibilityLabel={parts.map(([f, n]) => `${t(FEELING_KEY[f])} ${n}`).join(', ')}>
      {parts.map(([f, n]) => (
        <View key={f} style={styles.note}>
          <FeelingFace feeling={f} size={20} color={f === 1 && n > 0 ? colors.warning : colors.primary} />
          <AppText variant="small">{n}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius,
  },
  faces: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  face: {
    flex: 1,
    minWidth: 64,
    minHeight: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderWidth: 1.5,
    borderRadius: radius,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderRadius: 22,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
