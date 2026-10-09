// The six main staff screens as tabs, for the Guru and coordinators: Home (G1 or C1 by role),
// Mark attendance (C5), Students (C7), Follow-up calls (C10), Announcements (C15) and Ishtagoshti
// (I1, Phase 2 slice 6, docs/DECISIONS.md #57). Six labels do not fit a phone's bottom bar (62 px for
// "Attendance", 65 px for Telugu "Students" in a 53 px slot at 375 px), so the Slokas tab shows only in the
// sidebar; on a phone the staff home has a Slokas button under its ring (components/staff-shortcuts.tsx). On a phone
// the tabs sit at the bottom; on a wide screen (a laptop, a tablet held sideways) they become a
// sidebar on the left (docs/DECISIONS.md #36). The other staff screens (a profile, a call, here
// now, groups ...) open on top of the tabs from staff/_layout.tsx, with a back button.
// The tabs come with Expo Router (plain JavaScript), so they reach installed phones as an update.

import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { tabIcon } from '@/components/icon';
import { documentTitleLayout } from '@/lib/document-title';
import { tabsScreenOptions, useTheme } from '@/theme/use-theme';

/** Window width in pixels from which the tabs become a sidebar. */
const SIDEBAR_FROM = 900;

/** Tab navigator for the staff home and the four screens used most. */
export default function StaffTabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();

  return (
    <Tabs screenLayout={documentTitleLayout} screenOptions={tabsScreenOptions(colors, width >= SIDEBAR_FROM, fontScale)}>
      {/* The home has its own saffron header band instead of a header bar. */}
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), headerShown: false, tabBarIcon: tabIcon('home') }}
      />
      <Tabs.Screen
        name="attendance"
        options={{ title: t('attendance.title'), tabBarLabel: t('tabs.attendance'), tabBarIcon: tabIcon('attendance') }}
      />
      <Tabs.Screen
        name="students"
        options={{ title: t('staff.students'), tabBarLabel: t('tabs.students'), tabBarIcon: tabIcon('students') }}
      />
      <Tabs.Screen
        name="follow-up"
        options={{ title: t('staff.followUp'), tabBarLabel: t('tabs.calls'), tabBarIcon: tabIcon('calls') }}
      />
      <Tabs.Screen
        name="announcements"
        options={{ title: t('announcements.title'), tabBarLabel: t('tabs.news'), tabBarIcon: tabIcon('news') }}
      />
      <Tabs.Screen
        name="ishtagoshti"
        options={{
          title: t('ishtagoshti.title'),
          tabBarLabel: t('tabs.ishtagoshti'),
          tabBarIcon: tabIcon('ishtagoshti'),
          // null hides the button only; /staff/ishtagoshti still opens, with the tabs under it.
          href: width >= SIDEBAR_FROM ? undefined : null,
        }}
      />
    </Tabs>
  );
}
