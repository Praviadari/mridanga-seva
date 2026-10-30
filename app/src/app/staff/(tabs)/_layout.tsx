// The six main staff screens as tabs, for the Guru and coordinators: Home (G1 or C1 by role),
// Mark attendance (C5), Students (C7), Follow-up calls (C10), Announcements (C15) and Ishtagoshti
// (I1, Phase 2 slice 6, docs/DECISIONS.md #57). Six labels do not fit a phone's bottom bar (62 px for
// "Attendance", 65 px for Telugu "Students" in a 53 px slot at 375 px), so the Slokas tab shows only in the
// sidebar; on a phone the staff home has an Ishtagoshti circle (components/staff-shortcuts.tsx). Since the launch UI
// (#350, #353) every tab's header bar has the side menu's button at its left, and the tabs read Check-in and Follow-ups. On a phone
// the tabs sit at the bottom; on a wide screen (a laptop, a tablet held sideways) they become a
// sidebar on the left (docs/DECISIONS.md #36). The other staff screens (a profile, a call, here
// now, groups ...) open on top of the tabs from staff/_layout.tsx, with a back button.
// The tabs come with Expo Router (plain JavaScript), so they reach installed phones as an update.

import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { tabIcon } from '@/components/icon';
import { MenuButton } from '@/components/side-menu';
import { tabLabel } from '@/components/tab-label';
import { headerTitleOptions } from '@/components/header-title';
import { documentTitleLayout } from '@/lib/document-title';
import { useHeadingFont } from '@/theme/fonts';
import { tabsScreenOptions, useTheme } from '@/theme/use-theme';

/** Window width in pixels from which the tabs become a sidebar. */
const SIDEBAR_FROM = 900;

/** The side menu's button at the left of a tab's header bar. */
function menuButton() {
  return <MenuButton place="bar" />;
}

/** Tab navigator for the staff home and the four screens used most. */
export default function StaffTabsLayout() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const titleFont = useHeadingFont();
  const { width, fontScale } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_FROM;
  // As on the student tabs (#670): on a phone the Telugu and Hindi names take two lines ("ఫాలో-అప్‌లు" even at 412 px),
  // so the bar keeps room for the second line as for large text; without it the label stuck out 10 px under the
  // window and every staff tab scrolled (ring homes walk, 30-10-2026).
  const twoLines = !sidebar && i18n.language !== 'en' && width / 5 < 100;
  const tabs = tabsScreenOptions(colors, sidebar, twoLines ? Math.max(fontScale, 1.15) : fontScale, titleFont);

  return (
    <Tabs
      // The tabs are top-level screens: no back arrow on them (Material Design / iOS), and the phone's Back from any
      // tab returns to Home (Praveen 14-10-2026, #359).
      backBehavior="firstRoute"
      screenLayout={documentTitleLayout}
      screenOptions={{
        ...tabs,
        ...headerTitleOptions(tabs.headerTitleStyle),
        // The side menu (components/side-menu.tsx, #350) from every tab's header bar; the home has it in its band.
        headerLeft: menuButton,
      }}>
      {/* The home has its own saffron header band instead of a header bar. */}
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarLabel: tabLabel(t('tabs.home')), headerShown: false, tabBarIcon: tabIcon('home') }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ title: t('attendance.title'), tabBarLabel: tabLabel(t('tabs.attendance')), tabBarIcon: tabIcon('attendance') }}
      />
      <Tabs.Screen
        name="students"
        options={{ title: t('staff.students'), tabBarLabel: tabLabel(t('tabs.students')), tabBarIcon: tabIcon('students') }}
      />
      <Tabs.Screen
        name="follow-up"
        options={{ title: t('staff.followUp'), tabBarLabel: tabLabel(t('tabs.calls')), tabBarIcon: tabIcon('calls') }}
      />
      <Tabs.Screen
        name="announcements"
        options={{ title: t('announcements.title'), tabBarLabel: tabLabel(t('tabs.news')), tabBarIcon: tabIcon('news') }}
      />
      <Tabs.Screen
        name="ishtagoshti"
        options={{
          title: t('ishtagoshti.title'),
          tabBarLabel: tabLabel(t('tabs.ishtagoshti')),
          tabBarIcon: tabIcon('ishtagoshti'),
          // null hides the button only; /staff/ishtagoshti still opens, with the tabs under it.
          href: width >= SIDEBAR_FROM ? undefined : null,
        }}
      />
    </Tabs>
  );
}
