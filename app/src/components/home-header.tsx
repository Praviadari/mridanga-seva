// The saffron band at the top of the three home screens (S1, C1, G1): the drum mark, "Hare
// Krishna" and the person's name, their role, and the Hare Krishna maha-mantra as the line of the
// day. The mantra is the only devotional text the app shows for now: it is free to use in every
// script, while book translations are not (docs/DECISIONS.md #36). The band runs under the phone's
// status bar, so it keeps its own content clear of the notch.

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { maxDashboardWidth, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { MridangaMark } from './mridanga-mark';

/** Props for HomeHeader. */
export type HomeHeaderProps = {
  /** The person's name, or empty when the profile has none (then only "Hare Krishna" shows). */
  name: string | undefined;
  /** The role, already translated, e.g. "Guru". Left out on the student home. */
  role?: string;
};

/** Saffron header with the greeting, for the top of a home screen. */
export function HomeHeader({ name, role }: HomeHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // SVG gradient ids are global on a web page; useId keeps two headers from sharing one.
  const gradientId = `header-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View style={[styles.band, { paddingTop: insets.top + spacing.lg }]}>
      {/* width/height in percent: on the web an SVG without them is drawn 300 x 150 px. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" aria-hidden>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor={colors.headerTop} />
            <Stop offset="1" stopColor={colors.headerBottom} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>

      <View style={styles.column}>
        <View style={styles.row}>
          <View style={[styles.markCircle, { backgroundColor: colors.onHeader }]}>
            <MridangaMark size={40} color={colors.headerTop} accent={colors.onHeader} />
          </View>
          <View style={styles.names}>
            {name ? (
              <>
                <AppText variant="label" style={{ color: colors.onHeaderMuted }}>
                  {t('home.greetingNoName')}
                </AppText>
                <AppText variant="title" style={{ color: colors.onHeader }} numberOfLines={2}>
                  {name}
                </AppText>
              </>
            ) : (
              <AppText variant="title" style={{ color: colors.onHeader }}>
                {t('home.greetingNoName')}
              </AppText>
            )}
          </View>
        </View>

        {role ? (
          <AppText variant="small" style={{ color: colors.onHeaderMuted }}>
            {t('home.role', { role })}
          </AppText>
        ) : null}

        <View style={[styles.mantra, { borderColor: colors.onHeaderMuted }]}>
          <AppText variant="small" style={[styles.mantraText, { color: colors.onHeaderMuted }]}>
            {t('home.mantraLine1')}
          </AppText>
          <AppText variant="small" style={[styles.mantraText, { color: colors.onHeaderMuted }]}>
            {t('home.mantraLine2')}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    overflow: 'hidden',
  },
  column: {
    width: '100%',
    maxWidth: maxDashboardWidth,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  markCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: {
    flex: 1,
  },
  mantra: {
    borderLeftWidth: 2,
    paddingLeft: spacing.sm,
    marginTop: spacing.xs,
  },
  mantraText: {
    fontStyle: 'italic',
  },
});
