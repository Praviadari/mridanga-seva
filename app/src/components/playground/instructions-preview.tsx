// A Playground game's instructions before the round (docs/RHYTHM_PLAYGROUND.md §6.1 game flow, §13.5; #728): a few
// short lines, "Read again" (the screen speaks or replays them), and a large Start. Sound never starts by itself:
// only Start begins the round. The lines are plain text the screen reader reads in order; the step the round is
// at is said in words.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { IconBadge, type IconName } from '@/components/icon';
import { cardRadius, spacing, useTheme } from '@/theme/use-theme';

export type InstructionsPreviewProps = {
  /** "How to play" lines, in order. */
  lines: readonly string[];
  onStart: () => void;
  /** Read the lines out again (or replay a recorded instruction). */
  onReadAgain?: () => void;
  /** The difficulty step the round will be at. */
  step?: number;
  icon?: IconName;
  /** The Start button's words; default "Start". */
  startLabel?: string;
};

export function InstructionsPreview({ lines, onStart, onReadAgain, step, icon = 'listen', startLabel }: InstructionsPreviewProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.cardBorder }]}>
      <View style={styles.head}>
        <IconBadge name={icon} size={48} />
        <AppText variant="subtitle" accessibilityRole="header">
          {t('playEngine.instructions.title')}
        </AppText>
      </View>
      {lines.map((line, i) => (
        <AppText key={i} variant="body">
          {line}
        </AppText>
      ))}
      {typeof step === 'number' ? (
        <AppText variant="small" tone="muted">
          {t('playEngine.instructions.step', { step })}
        </AppText>
      ) : null}
      <View style={styles.buttons}>
        {onReadAgain ? <Button label={t('playEngine.instructions.readAgain')} icon="refresh" variant="secondary" onPress={onReadAgain} /> : null}
        <Button label={startLabel ?? t('playEngine.instructions.start')} icon="play" size="large" onPress={onStart} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: cardRadius, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
