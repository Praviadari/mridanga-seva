// The person button at the top right of the home headers (S1, C1, G1), beside the bell: opens My
// profile (A3) with the language switch, Sign out and the version line (Praveen 10-10-2026,
// docs/DECISIONS.md #240). Drawn like the bell (components/inbox-bell.tsx).

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { useTheme } from '@/theme/use-theme';

import { Icon } from './icon';

/** The button to My profile in a home header. */
export function ProfileButton() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const path = profile?.role === 'student' ? '/student/profile' : '/staff/profile';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('myProfile.title')}
      hitSlop={8}
      onPress={() => router.push(path)}
      style={({ pressed }) => [styles.button, { borderColor: colors.onHeaderMuted }, pressed && styles.pressed]}>
      <Icon name="profile" size={24} color={colors.onHeader} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});