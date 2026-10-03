// The quiet block at the end of each home screen (S1, C1, G1): the language switch, Sign out and
// the app version line. Kept apart from the class's numbers, so the home starts with what the
// person came for. "My profile" opens A3 (screens/my-profile.tsx), which has the same switch and
// Sign out with the person's name and phone (round 7). "Notifications" opens the inbox (A2, round 9).

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
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
  const { profile } = useAuth();
  const profilePath = profile?.role === 'student' ? '/student/profile' : '/staff/profile';
  const inboxPath = profile?.role === 'student' ? '/student/notifications' : '/staff/notifications';
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
        <Button variant="link" icon="bell" label={t('inbox.title')} onPress={() => router.push(inboxPath)} />
        <Button variant="link" icon="profile" label={t('myProfile.title')} onPress={() => router.push(profilePath)} />
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
