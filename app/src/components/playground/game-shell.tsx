// The frame every Rhythm Playground game shares (docs/RHYTHM_PLAYGROUND.md §5.3, §6.1, §13.5; #728): the game's
// name, an Exit that is always visible, the progress dots of the round, the "TEST sounds" badge while no recording
// is approved (§19.3), "Review practice" when the pool is small (§8.7) and "Review" on a spaced-review challenge
// (§8.6). The game's own content goes inside. Nothing moves: the dots change colour and word, no animation, so the
// shell needs no reduced-motion case. Every state is said in words as well as colour.

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { maxContentWidth, radius, spacing, useTheme } from '@/theme/use-theme';

export type GameShellProps = {
  title: string;
  /** Leaves the game (answered items are kept by the screen). */
  onExit: () => void;
  /** The round's challenges and the one shown now (0-based); omit before and after the round. */
  progress?: { current: number; total: number; done?: readonly (boolean | null)[] };
  /** Placeholder (TEST) content is playing: the "TEST sounds" badge. */
  testSounds?: boolean;
  /** The pool is small: the round is "Review practice". */
  lowContent?: boolean;
  /** The challenge shown is a spaced-review one. */
  review?: boolean;
  children: ReactNode;
};

export function GameShell({ title, onExit, progress, testSounds, lowContent, review, children }: GameShellProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <AppText variant="subtitle" accessibilityRole="header" style={styles.title} numberOfLines={2}>
          {title}
        </AppText>
        <Button
          label={t('playEngine.shell.exit')}
          icon="close"
          variant="secondary"
          onPress={onExit}
          accessibilityLabel={t('playEngine.shell.exitHint', { game: title })}
        />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {testSounds || lowContent || review ? (
          <View style={styles.badges}>
            {testSounds ? <Badge icon="instruments" text={t('playEngine.shell.testSounds')} hint={t('playEngine.shell.testSoundsHint')} /> : null}
            {review ? <Badge icon="loop" text={t('playEngine.shell.review')} hint={t('playEngine.shell.reviewHint')} /> : null}
          </View>
        ) : null}
        {lowContent ? (
          <View style={[styles.notice, { backgroundColor: colors.surfaceSunken }]} accessibilityRole="text">
            <AppText variant="small">{t('playEngine.shell.reviewPractice')}</AppText>
          </View>
        ) : null}
        {progress && progress.total > 0 ? <ProgressDots {...progress} /> : null}
        {children}
      </ScrollView>
    </View>
  );
}

function Badge({ icon, text, hint }: { icon: 'instruments' | 'loop'; text: string; hint: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { borderColor: colors.accent, backgroundColor: colors.surface }]} accessible accessibilityLabel={`${text}. ${hint}`}>
      <Icon name={icon} size={16} color={colors.text} />
      <AppText variant="small">{text}</AppText>
    </View>
  );
}

/** One dot per challenge: filled when answered (a tick or a dot by itself is not the result: the words say it). */
function ProgressDots({ current, total, done }: { current: number; total: number; done?: readonly (boolean | null)[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.progress} accessible accessibilityLabel={t('playEngine.shell.progress', { n: Math.min(current + 1, total), total })}>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => {
          const answered = done?.[i] !== undefined && done?.[i] !== null;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                { borderColor: colors.primary, backgroundColor: answered ? colors.primary : 'transparent' },
                i === current && { width: 16, height: 16, borderRadius: 8 },
              ]}
            />
          );
        })}
      </View>
      <AppText variant="small" tone="muted">
        {t('playEngine.shell.progress', { n: Math.min(current + 1, total), total })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1 },
  body: { padding: spacing.md, gap: spacing.md, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderWidth: 1, borderRadius: radius, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  notice: { borderRadius: radius, padding: spacing.sm },
  progress: { alignItems: 'center', gap: spacing.xs },
  dots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
});
