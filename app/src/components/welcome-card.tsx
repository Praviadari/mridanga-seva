// The one-time welcome on the student home when a waiting account has become a student (audit phase 5 U2-04,
// docs/DECISIONS.md #342): "Hare Krishna, {name}. Welcome to the class.", the roll number large, what My QR is
// for, and two ways on: Show my QR (the one thing to do at the door) or Go to my home. Calm, no confetti.
// When to show it: lib/welcome.ts. It stands in place of the circles until it is closed.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { levelName } from '@/i18n/labels';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { MridangaMark } from './mridanga-mark';

/** Props for WelcomeCard. */
export type WelcomeCardProps = {
  /** The student's first name (or whole name). */
  name: string;
  rollNo: string | null;
  levelId: number;
  /** Show my QR: the home marks the welcome seen and opens My QR. */
  onShowQr: () => void;
  /** Go to my home: the home marks the welcome seen. */
  onClose: () => void;
};

/** The welcome card. */
export function WelcomeCard({ name, rollNo, levelId, onShowQr, onClose }: WelcomeCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.card, cardLook(colors)]}>
      <MridangaMark size={56} color={colors.primary} accent={colors.surface} />
      <AppText variant="title" family="sans" style={styles.centre}>
        {t('welcome.title', { name })}
      </AppText>
      {rollNo ? (
        <View style={styles.roll}>
          <AppText tone="muted">{t('welcome.rollNo')}</AppText>
          <AppText variant="number" selectable>
            {rollNo}
          </AppText>
        </View>
      ) : null}
      <AppText style={styles.centre}>{t('welcome.entryCard')}</AppText>
      <AppText tone="muted" style={styles.centre}>
        {t('welcome.level', { level: levelName(t, levelId) })}
      </AppText>
      <View style={styles.buttons}>
        <Button size="large" icon="qr" label={t('welcome.showQr')} onPress={onShowQr} />
        <Button variant="link" label={t('welcome.goHome')} onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  centre: {
    textAlign: 'center',
  },
  roll: {
    alignItems: 'center',
  },
  buttons: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
});
