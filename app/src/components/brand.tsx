// The app's name and drum mark: a full-screen splash for loading, and the saffron header of the
// sign-in screens. The splash keeps the drum image of the phone's own splash screen (a new one
// needs a new APK); the header draws the app's own mark (components/mridanga-mark.tsx). Both
// stand in for a logo until the team has one (docs/DECISIONS.md #36). A start that takes long says so on the
// splash, with Try again (src/lib/slow-start.ts, docs/DECISIONS.md #237).

import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { restartApp } from '@/lib/slow-start';
import { brand, onBrand } from '@/theme/colors';
import { maxContentWidth, radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { MridangaMark } from './mridanga-mark';
import { SaffronBand } from './saffron-band';

const drum = require('@/assets/images/splash-icon.png');

/**
 * Full-screen saffron splash with the drum and the app name. Looks like the phone's own splash
 * screen (app.json, expo-splash-screen), so the change from one to the other cannot be seen.
 * Also the only splash on the web version, where there is no native one.
 * @param slow true when the start takes long (src/lib/slow-start.ts): the splash then says so and offers
 *        Try again, which starts the app again.
 */
export function BrandSplash({ slow }: { slow?: boolean }) {
  const { t } = useTranslation();
  if (slow) {
    return (
      <View style={[styles.splash, { backgroundColor: brand }]}>
        <Image source={drum} style={styles.splashImage} resizeMode="contain" />
        <AppText variant="title" style={styles.splashText}>
          {t('app.name')}
        </AppText>
        {/* Read out as soon as it appears. */}
        <AppText role="alert" aria-live="assertive" style={[styles.splashText, styles.slowText]}>
          {t('app.slowStart')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => void restartApp()}
          style={({ pressed }) => [styles.retry, { opacity: pressed ? 0.8 : 1 }]}>
          <AppText style={styles.retryText}>{t('common.tryAgain')}</AppText>
        </Pressable>
      </View>
    );
  }
  return (
    // accessible + role, or the label on a plain View is never read out; the whole splash is one
    // "Loading" for screen readers.
    <View
      style={[styles.splash, { backgroundColor: brand }]}
      accessible
      role="progressbar"
      aria-busy
      accessibilityLabel={t('common.loading')}>
      <Image source={drum} style={styles.splashImage} resizeMode="contain" />
      <AppText variant="title" style={styles.splashText}>
        {t('app.name')}
      </AppText>
      <ActivityIndicator color={onBrand} />
    </View>
  );
}

/** Props for BrandHeader. */
export type BrandHeaderProps = {
  /** Smaller and without the one-line description: for the screens after sign-in itself. */
  compact?: boolean;
};

/**
 * Saffron band with the drum mark, the app name and its one-line description, for the top of the
 * sign-in screens. The same band as the home screens' header (components/saffron-band.tsx).
 */
export function BrandHeader({ compact }: BrandHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const circle = compact ? 56 : 80;
  return (
    <SaffronBand centred maxWidth={maxContentWidth}>
      <View
        style={[
          styles.badge,
          { width: circle, height: circle, borderRadius: circle / 2, backgroundColor: colors.onHeader },
        ]}>
        <MridangaMark size={Math.round(circle * 0.72)} color={colors.headerTop} accent={colors.onHeader} />
      </View>
      <AppText variant={compact ? 'subtitle' : 'title'} style={{ color: colors.onHeader }}>
        {t('app.name')}
      </AppText>
      {/* The motto, "Saṅkalpa · Sādhana · Seva" (Praveen, 2 Oct 2026; DECISIONS.md #39). */}
      <AppText variant="small" style={[styles.centreText, styles.motto, { color: colors.onHeaderMuted }]}>
        {t('app.motto')}
      </AppText>
      {compact ? null : (
        <AppText style={[styles.centreText, { color: colors.onHeaderMuted }]}>{t('app.tagline')}</AppText>
      )}
    </SaffronBand>
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
    color: onBrand,
  },
  slowText: {
    textAlign: 'center',
    maxWidth: 320,
    paddingHorizontal: spacing.lg,
  },
  // White on the saffron, like the splash text; at least 48 px tall for a finger.
  retry: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius,
    backgroundColor: onBrand,
  },
  retryText: {
    color: brand,
    fontWeight: '600',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreText: {
    textAlign: 'center',
  },
  motto: {
    letterSpacing: 1,
    marginTop: -spacing.xs,
  },
});
