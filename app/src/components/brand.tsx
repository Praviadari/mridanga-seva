// The app's name and drum mark: a full-screen splash for loading, and a small header for the
// sign-in screens. The drum image is a placeholder until the team picks a logo
// (app/scripts/make-placeholder-icons.mjs).

import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { brand } from '@/theme/colors';
import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';

const drum = require('@/assets/images/splash-icon.png');

/**
 * Full-screen saffron splash with the drum and the app name. Looks like the phone's own splash
 * screen (app.json, expo-splash-screen), so the change from one to the other cannot be seen.
 * Also the only splash on the web version, where there is no native one.
 */
export function BrandSplash() {
  const { t } = useTranslation();
  return (
    <View style={[styles.splash, { backgroundColor: brand }]} accessibilityLabel={t('common.loading')}>
      <Image source={drum} style={styles.splashImage} resizeMode="contain" />
      <AppText variant="title" style={styles.splashText}>
        {t('app.name')}
      </AppText>
      <ActivityIndicator color="#FFFFFF" />
    </View>
  );
}

/** Drum mark, app name and one-line description, for the top of the sign-in screens. */
export function BrandHeader() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.badge, { backgroundColor: brand }]}>
        <Image source={drum} style={styles.badgeImage} resizeMode="contain" />
      </View>
      <AppText variant="title" style={{ color: colors.text }}>
        {t('app.name')}
      </AppText>
      <AppText tone="muted" style={styles.centreText}>
        {t('app.tagline')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  // Same width as "imageWidth" for expo-splash-screen in app.json.
  splashImage: {
    width: 200,
    height: 200,
  },
  splashText: {
    color: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImage: {
    width: 60,
    height: 60,
  },
  centreText: {
    textAlign: 'center',
  },
});
