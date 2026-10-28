// The end of a Playground round (docs/RHYTHM_PLAYGROUND.md §6.1 game flow, §8.8, §12.4; #728): how many were found,
// the close pairs worth practising, the adaptive offer (the student chooses; nothing moves by itself), "Now play it
// on your khol", and Play again / Back to Playground. No points, no comparison with others, no "lost".

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { announce } from '@/lib/announce';
import { cardRadius, spacing, useTheme } from '@/theme/use-theme';

export type RoundSummaryProps = {
  /** Answers marked right, and how many were marked (performance-only rounds: omit both). */
  right?: number;
  total?: number;
  /** "tā and nā were close": pairs to practise, as the class writes them. */
  closePairs?: readonly string[];
  /** The adaptive rules' offer (lib/playground/adaptive.ts). */
  offer?: 'harder' | 'easier' | null;
  onTakeOffer?: () => void;
  /** Rounds still waiting to be saved on this phone (offline). */
  waiting?: number;
  /** Show "Now play it on your khol". */
  kholHint?: boolean;
  onPlayAgain: () => void;
  onBack: () => void;
};

export function RoundSummary({ right, total, closePairs = [], offer = null, onTakeOffer, waiting = 0, kholHint = true, onPlayAgain, onBack }: RoundSummaryProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scored = typeof right === 'number' && typeof total === 'number' && total > 0;
  const headline = scored ? t('playEngine.summary.found', { right, total }) : t('playEngine.summary.done');
  useEffect(() => {
    announce(headline);
  }, [headline]);
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.cardBorder }]}>
      <View style={styles.row}>
        <Icon name="score" size={28} color={colors.accent} />
        <AppText variant="subtitle" accessibilityRole="header">
          {headline}
        </AppText>
      </View>
      {closePairs.length > 0 ? <AppText>{t('playEngine.summary.closePairs', { pairs: closePairs.join(', ') })}</AppText> : null}
      {waiting > 0 ? (
        <AppText variant="small" tone="muted">
          {t('playEngine.summary.waiting', { count: waiting })}
        </AppText>
      ) : null}
      {kholHint ? (
        <View style={styles.row}>
          <Icon name="drum" size={22} />
          <AppText>{t('playEngine.summary.khol')}</AppText>
        </View>
      ) : null}
      <View style={styles.buttons}>
        {offer && onTakeOffer ? (
          <Button
            label={offer === 'harder' ? t('playEngine.summary.harder') : t('playEngine.summary.easier')}
            variant="secondary"
            icon={offer === 'harder' ? 'up' : 'down'}
            onPress={onTakeOffer}
          />
        ) : null}
        <Button label={t('playEngine.summary.playAgain')} icon="loop" size="large" onPress={onPlayAgain} />
        <Button label={t('playEngine.summary.back')} variant="secondary" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: cardRadius, padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttons: { gap: spacing.sm },
});
