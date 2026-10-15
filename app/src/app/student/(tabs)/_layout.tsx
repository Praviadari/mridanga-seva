// The student's four tabs: Home (S1), My QR (S3), News (S10) and Slokas (I1, Phase 2
// slice 6, docs/DECISIONS.md #57). Always at the bottom, also on a wide screen: students have only four,
// and the sidebar is for staff
// (docs/DECISIONS.md #36). One announcement opens on top of the tabs from student/_layout.tsx.
// The tabs come with Expo Router (plain JavaScript), so they reach installed phones as an update.

import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { tabIcon } from '@/components/icon';
import { tabLabel } from '@/components/tab-label';
import { documentTitleLayout } from '@/lib/document-title';
import { useHeadingFont } from '@/theme/fonts';
import { tabsScreenOptions, useTheme } from '@/theme/use-theme';

/** Tab navigator for the student screens. */
export default function StudentTabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const titleFont = useHeadingFont();
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs screenLayout={documentTitleLayout} screenOptions={tabsScreenOptions(colors, false, fontScale, titleFont)}>
      {/* The home has its own saffron header band instead of a header bar. */}
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarLabel: tabLabel(t('tabs.home')), headerShown: false, tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen
        name="my-qr"
        options={{ title: t('myQr.title'), tabBarLabel: tabLabel(t('tabs.myQr')), tabBarIcon: tabIcon('qr') }}
      />
      <Tabs.Screen
        name="announcements"
        options={{ title: t('announcements.title'), tabBarLabel: tabLabel(t('tabs.news')), tabBarIcon: tabIcon('news') }}
      />
      <Tabs.Screen
        name="ishtagoshti"
        // The header says what the tab says, "Slokas" (#382); staff keep "Ishtagoshti" (#353).
        options={{ title: t('tabs.ishtagoshti'), tabBarLabel: tabLabel(t('tabs.ishtagoshti')), tabBarIcon: tabIcon('ishtagoshti') }}
      />
    </Tabs>
  );
}
