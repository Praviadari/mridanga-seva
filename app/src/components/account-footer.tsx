// The quiet block at the end of each home screen (S1, C1, G1): the language switch, Sign out and
// the app version line. Kept apart from the class's numbers, so the home starts with what the
// person came for. Becomes part of a Profile screen (A3) when that is built.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { signOut } from '@/auth/auth-actions';
import { cardLook, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon } from './icon';
import { LanguagePicker } from './language-picker';
import { VersionLine } from './update-notice';

/** Language switch, Sign out and version, in a card at the bottom of a home screen. */
export function AccountFooter() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <>
      <View style={[styles.card, cardLook(colors)]}>
        <View style={styles.heading}>
          <Icon name="language" size={20} color={colors.textMuted} />
          <AppText variant="label" tone="muted">
            {t('common.language')}
          </AppText>
        </View>
        <LanguagePicker />
        <Button variant="link" icon="signOut" label={t('common.signOut')} onPress={() => void signOut()} />
      </View>
      <VersionLine />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
