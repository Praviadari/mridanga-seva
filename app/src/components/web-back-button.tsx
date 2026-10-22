// The header's back button on the web, named in the app's language (audit phase 4 P2-07, docs/DECISIONS.md
// #332). The navigation library's own one is read out in English ("Go back", or "<title>, back") whatever the
// language; phones keep their own (Android names it itself). Used by the staff, student and subscriber stacks.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, type ColorValue } from 'react-native';

import { Icon } from './icon';

/** What the header hands its left button. */
type HeaderLeftProps = { canGoBack?: boolean; tintColor?: ColorValue };

function WebBackButton({ canGoBack, tintColor }: HeaderLeftProps) {
  const { t } = useTranslation();
  if (!canGoBack) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={() => router.back()}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon name="back" size={24} color={tintColor} />
    </Pressable>
  );
}

/** Stack screenOptions to spread after headerBarOptions(colors): the translated back button on the web only. */
export const webBackOptions =
  Platform.OS === 'web' ? { headerLeft: (props: HeaderLeftProps) => <WebBackButton {...props} /> } : {};

const styles = StyleSheet.create({
  button: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
