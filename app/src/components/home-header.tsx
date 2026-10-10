// The saffron band at the top of the three home screens (S1, C1, G1): the drum mark, "Hare
// Krishna" and the person's name, their role, and the Hare Krishna maha-mantra as the line of the
// day. The mantra is free to use in every script, while book translations are not, so the header
// shows only the mantra (docs/DECISIONS.md #36); slokas with the temple's own translations live in
// the Ishtagoshti tab (#57). The band itself, with its
// gradient and the space for the notch, is components/saffron-band.tsx. The bell at the top right opens the
// notifications inbox (A2, components/inbox-bell.tsx); beside it the person button opens My profile (A3,
// components/profile-button.tsx; Praveen 10-10-2026, instead of a circle on the simple homes, #240).

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { InboxBell } from './inbox-bell';
import { ProfileButton } from './profile-button';
import { MridangaMark } from './mridanga-mark';
import { SaffronBand } from './saffron-band';

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

  return (
    <SaffronBand>
      <View style={styles.row}>
        <View style={[styles.markCircle, { backgroundColor: colors.onHeader }]}>
          <MridangaMark size={34} color={colors.headerTop} accent={colors.onHeader} />
        </View>
        <View style={styles.names}>
          {name ? (
            <>
              <AppText variant="label" style={{ color: colors.onHeaderMuted }}>
                {t('home.greetingNoName')}
              </AppText>
              <AppText variant="title" style={[styles.name, { color: colors.onHeader }]} numberOfLines={2}>
                {name}
              </AppText>
            </>
          ) : (
            <AppText variant="title" style={{ color: colors.onHeader }}>
              {t('home.greetingNoName')}
            </AppText>
          )}
        </View>
        <View style={styles.buttons}>
          <InboxBell />
          <ProfileButton />
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
    </SaffronBand>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  markCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: {
    flex: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  // A little under the title size, so a usual name stays on one line beside the two buttons.
  name: {
    fontSize: 22,
    lineHeight: 28,
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
