// A small celebration on the student home (audit 22-10-2026 fix 12, docs/DECISIONS.md #621-#623): "Hare Krishna! A step
// forward", what happened (a move up a level, a practice milestone, items ticked in class; at most three lines and
// "and 2 more steps"), a line of blessing and Continue. Calm: the card fades in and rises a few pixels, nothing
// flies or repeats, and with the phone's or browser's "reduce motion" it simply appears. A screen reader hears the
// whole text once. Which events and when: lib/celebrations.ts. Like the welcome, it stands in place of the circles.

import type { TFunction } from 'i18next';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { levelName } from '@/i18n/labels';
import { announce } from '@/lib/announce';
import type { CelebrationEvent } from '@/lib/celebrations';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { MridangaMark } from './mridanga-mark';
import { milestoneName } from './practice-parts';

/** How many events the card names; the rest are counted. */
export const CELEBRATION_LINES = 3;

/** Props for CelebrationCard. */
export type CelebrationCardProps = {
  /** The events to celebrate, most important first (lib/celebrations.ts dueCelebrations). */
  events: readonly CelebrationEvent[];
  onClose: () => void;
};

/** One event in words. */
export function celebrationLine(t: TFunction, event: CelebrationEvent): string {
  switch (event.kind) {
    case 'level':
      return t('celebrate.level', { level: levelName(t, event.levelId) });
    case 'milestone':
      return t('celebrate.milestone', { name: milestoneName(t, event.milestone) });
    case 'tick':
      return t('celebrate.tick', { title: event.title });
  }
}

/** The celebration card. */
export function CelebrationCard({ events, onClose }: CelebrationCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const lines = events.slice(0, CELEBRATION_LINES).map((event) => celebrationLine(t, event));
  const more = events.length - lines.length;
  const moreText = more > 0 ? t('celebrate.more', { count: more }) : null;
  const message = [t('celebrate.title'), ...lines, moreText, t('celebrate.blessing')].filter(Boolean).join('. ');
  useEffect(() => announce(message), [message]);

  // Fades in and rises 8 px over 0.7 s, once; still when the person asked for less motion (#332).
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) shown.setValue(1);
        else Animated.timing(shown, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }).start();
      });
    return () => {
      cancelled = true;
    };
  }, [shown]);
  const rise = shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Animated.View style={[styles.card, cardLook(colors), { opacity: shown, transform: [{ translateY: rise }] }]}>
      <MridangaMark size={48} color={colors.primary} accent={colors.surface} />
      {/* role status: the browser's screen reader reads the text when it appears (announce() does the phones). */}
      <View role="status" style={styles.text}>
        <AppText variant="title" family="sans" style={styles.centre}>
          {t('celebrate.title')}
        </AppText>
        {lines.map((line, i) => (
          <AppText key={events[i].key} style={styles.centre}>
            {line}
          </AppText>
        ))}
        {moreText ? (
          <AppText tone="muted" style={styles.centre}>
            {moreText}
          </AppText>
        ) : null}
        <AppText tone="muted" style={styles.centre}>
          {t('celebrate.blessing')}
        </AppText>
      </View>
      <Button label={t('celebrate.continue')} onPress={onClose} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  text: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  centre: {
    textAlign: 'center',
  },
});
