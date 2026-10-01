// The student's three tabs: Home (S1), My QR (S3) and Announcements (S10). Always at the bottom,
// also on a wide screen: students have only three, and the sidebar is for staff
// (docs/DECISIONS.md #36). One announcement opens on top of the tabs from student/_layout.tsx.
// The tabs come with Expo Router (plain JavaScript), so they reach installed phones as an update.

import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { tabIcon } from '@/components/icon';
import { tabsScreenOptions, useTheme } from '@/theme/use-theme';

/** Tab navigator for the student screens. */
export default function StudentTabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={tabsScreenOptions(colors, false)}>
      {/* The home has its own saffron header band instead of a header bar. */}
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), headerShown: false, tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen
        name="my-qr"
        options={{ title: t('myQr.title'), tabBarLabel: t('tabs.myQr'), tabBarIcon: tabIcon('qr') }}
      />
      <Tabs.Screen
        name="announcements"
        options={{ title: t('announcements.title'), tabBarLabel: t('tabs.news'), tabBarIcon: tabIcon('news') }}
      />
    </Tabs>
  );
}
