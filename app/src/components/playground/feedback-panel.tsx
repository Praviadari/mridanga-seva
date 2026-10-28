// What a Playground game says after an answer (docs/RHYTHM_PLAYGROUND.md §7 "Feedback words", §13.5; #728): right =
// "That's it!" with a tick; not right = "Not yet — listen again", and after the last try the right answer is shown
// (and the screen plays it). Never "wrong", "failed" or "off beat"; never colour alone. The words are read out once
// by the screen reader (announce on phones; a polite live region on the web).

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { announce } from '@/lib/announce';
import { cardRadius, spacing, useTheme } from '@/theme/use-theme';

export type FeedbackPanelProps = {
  right: boolean;
  /** Shown when not right and no try is left: the right answer as the class writes it. */
  answerLabel?: string | null;
  /** Tries left; when 0 (or not given) the answer is shown. */
  triesLeft?: number;
  onListenAgain?: () => void;
  /** Try again (tries left) or Next. */
  onNext: () => void;
  /** The last challenge: "See how it went" instead of "Next". */
  last?: boolean;
};

export function FeedbackPanel({ right, answerLabel, triesLeft = 0, onListenAgain, onNext, last }: FeedbackPanelProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const showAnswer = !right && triesLeft <= 0 && Boolean(answerLabel);
  const words = right ? t('playEngine.feedback.right') : t('playEngine.feedback.notYet');
  const answerWords = showAnswer ? t('playEngine.feedback.answer', { answer: answerLabel }) : '';
  useEffect(() => {
    announce([words, answerWords].filter(Boolean).join(' '));
  }, [words, answerWords]);
  const again = !right && triesLeft > 0;
  return (
    <View
      style={[styles.panel, { backgroundColor: right ? colors.successSurface : colors.surfaceSunken, borderColor: right ? colors.success : colors.border }]}
      accessibilityLiveRegion="polite"
      role="status"
    >
      <View style={styles.row}>
        <Icon name={right ? 'check' : 'listen'} size={28} color={right ? colors.success : colors.text} />
        <AppText variant="subtitle">{words}</AppText>
      </View>
      {showAnswer ? <AppText variant="body">{answerWords}</AppText> : null}
      <View style={styles.buttons}>
        {onListenAgain && !right ? <Button label={t('playEngine.feedback.listenAgain')} icon="listen" variant="secondary" onPress={onListenAgain} /> : null}
        <Button
          label={again ? t('playEngine.feedback.tryAgain') : last ? t('playEngine.feedback.finish') : t('playEngine.feedback.next')}
          size="large"
          onPress={onNext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: cardRadius, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttons: { gap: spacing.sm },
});
