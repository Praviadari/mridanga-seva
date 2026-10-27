// The band at the top of the three home screens (S1, C1, G1). Since the launch UI (14-10-2026, docs/DECISIONS.md
// #352; Praveen: "divine peace feeling, international standard", reference = the team's "version 3" mockup): the
// app's name in gold serif with its motto in the middle, one button on each side, then a thin gold rule and "Hare
// Krishna" with the person's name (the role is in the side menu and said to screen readers). One button per side,
// both 40 px, keeps the name, the rule and the greeting on the phone's centre line (Praveen 14-10-2026): staff have
// the side menu's button (#350) on the left and the bell on the right (My profile is in the side menu); students
// have My profile on the left and the bell on the right. The maha-mantra left the header (Praveen 14-10-2026:
// everyone knows it, the home must not scroll; it is now at the foot of the side menu; amends #36). The band itself,
// with its gradient, golden halo and the space for the notch, is components/saffron-band.tsx. The bell opens the
// notifications inbox (A2, components/inbox-bell.tsx); the person button opens My profile (A3,
// components/profile-button.tsx, #240).

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { InboxBell } from './inbox-bell';
import { MenuButton } from './side-menu';
import { ProfileButton } from './profile-button';
import { SaffronBand } from './saffron-band';
import { UpdatesBell } from './updates-bell';

/** Props for HomeHeader. */
export type HomeHeaderProps = {
  /** The person's name, or empty when the profile has none (then only "Hare Krishna" shows). */
  name: string | undefined;
  /**
   * The role, already translated, e.g. "Guru": said with the greeting to screen readers only; the band shows it no
   * more, to stay short (#352; the side menu shows it). Left out on the student home.
   */
  role?: string;
  /** Staff homes: the side menu's button (components/side-menu.tsx) on the left, in place of My profile (#350). */
  menu?: boolean;
  /**
   * The student home since #672: the band made compact (no rule, the greeting closer), the Updates bell on the right
   * and nothing on the left (My profile is in the Me tab), so Today's Practice comes higher on the phone.
   */
  student?: boolean;
};

/** The home's header band with the app's name and the greeting. */
export function HomeHeader({ name, role, menu, student }: HomeHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <SaffronBand>
      <View style={styles.row}>
        <View style={styles.side}>{menu ? <MenuButton place="band" /> : student ? null : <ProfileButton />}</View>
        <View style={styles.brand}>
          {/* As wide as the space between the buttons, and smaller rather than cut at large text (#372). */}
          <AppText
            variant="title"
            style={[styles.brandName, { color: colors.headerGold }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}>
            {t('app.name')}
          </AppText>
          <AppText variant="small" style={[styles.motto, { color: colors.headerGold }]}>
            {t('app.motto')}
          </AppText>
        </View>
        <View style={[styles.side, styles.right]}>
          {student ? <UpdatesBell place="band" /> : <InboxBell />}
        </View>
      </View>

      {/* A thin gold rule with a dot in the middle, like the website's lotus divider; not on the compact band. */}
      {student ? null : (
        <View style={styles.rule} aria-hidden>
          <View style={[styles.ruleLine, { backgroundColor: colors.headerGold }]} />
          <View style={[styles.ruleDot, { backgroundColor: colors.headerGold }]} />
          <View style={[styles.ruleLine, { backgroundColor: colors.headerGold }]} />
        </View>
      )}

      <View style={styles.greeting}>
        {/* "Hare Krishna, Name" on one line when it fits, so the circles stay near the top. */}
        <View
          style={styles.greetingLine}
          accessible
          accessibilityLabel={[t('home.greetingNoName'), name, role ? t('home.role', { role }) : undefined].filter(Boolean).join(', ')}>
          <AppText variant="label" style={[styles.centred, { color: colors.onHeaderMuted }]}>
            {name ? `${t('home.greetingNoName')},` : t('home.greetingNoName')}
          </AppText>
          {name ? (
            <AppText variant="label" style={[styles.centred, styles.name, { color: colors.onHeader }]}>
              {name}
            </AppText>
          ) : null}
        </View>
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
  // One 40 px button on each side, so the name in the middle is centred on the phone.
  side: {
    width: 40,
  },
  right: {
    alignItems: 'flex-end',
  },
  brand: {
    flex: 1,
    alignItems: 'center',
  },
  // The name and motto span the middle, not just their own words: a box sized to its words can be drawn a little wider
  // than measured on Android and hide the last word on a second line, as the sign-in band did with "सेवा" (#372).
  brandName: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  motto: {
    alignSelf: 'stretch',
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    opacity: 0.7,
  },
  ruleLine: {
    width: 56,
    height: StyleSheet.hairlineWidth * 2,
  },
  ruleDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  greeting: {
    alignItems: 'center',
  },
  centred: {
    textAlign: 'center',
  },
  greetingLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'baseline',
    columnGap: spacing.xs,
  },
  name: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700',
  },
});
