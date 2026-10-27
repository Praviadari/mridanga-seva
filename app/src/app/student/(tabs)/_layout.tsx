// The student's four tabs since 27-10-2026 (docs/DECISIONS.md #670; Sarvesh Prji's student spec, sections 1-2):
// Home, Learn, Practice and Me. My QR, Updates (announcements) and Śloka Study (Ishtagoshti) were tabs until then;
// they are screens on top of the tabs now, at the same addresses (student/my-qr.tsx, announcements.tsx,
// ishtagoshti.tsx), so links and notifications open them as before. Updates is the bell with its unread count at
// the top of every tab (components/updates-bell.tsx), Śloka Study a shortcut on the home, My QR on Home and Me.
// Every name is always shown, and the open tab is told by its filled icon in a pill and a bold name, not only by
// colour (#338). Practice is the Śrī Khol (components/khol-icon.tsx, #671). Always at the bottom, also on a wide
// screen: students have only four, and the sidebar is for staff (docs/DECISIONS.md #36).
// The tabs are in the web version's first download (web-routes/route-context.ts), so they stay light: each opens the
// heavier screens (practice tools, lessons, assessments, events) from the student area, which loads later (#650).
// The tabs come with Expo Router (plain JavaScript), so they reach installed phones as an update.

import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { tabIcon } from '@/components/icon';
import { tabLabel } from '@/components/tab-label';
import { headerTitleOptions } from '@/components/header-title';
import { UpdatesBell } from '@/components/updates-bell';
import { documentTitleLayout } from '@/lib/document-title';
import { useHeadingFont } from '@/theme/fonts';
import { spacing, tabsScreenOptions, useTheme } from '@/theme/use-theme';

/** The bell at the right of a tab's header bar. */
function HeaderBell() {
  return <UpdatesBell place="bar" />;
}

/** Tab navigator for the student screens. */
export default function StudentTabsLayout() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const titleFont = useHeadingFont();
  const { fontScale, width } = useWindowDimensions();
  // A narrow window (a small phone, or the browser zoomed to 200 %) takes the Telugu and Hindi names on two lines
  // ("నేర్చుకోండి"), so the bar keeps room for the second line as for large text (#670; seen in the 27-10 walk).
  const tabs = tabsScreenOptions(colors, false, i18n.language !== 'en' && width / 4 < 100 ? Math.max(fontScale, 1.15) : fontScale, titleFont);
  return (
    <Tabs
      screenLayout={documentTitleLayout}
      screenOptions={{
        ...tabs,
        ...headerTitleOptions(tabs.headerTitleStyle),
        headerRight: HeaderBell,
        headerRightContainerStyle: { paddingRight: spacing.md },
      }}>
      {/* The home has its own band with the bell instead of a header bar. */}
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarLabel: tabLabel(t('tabs.home')), headerShown: false, tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen
        name="learn"
        options={{ title: t('progress.title'), tabBarLabel: tabLabel(t('tabs.learn')), tabBarAccessibilityLabel: t('tabs.learn'), tabBarIcon: tabIcon('syllabus') }}
      />
      <Tabs.Screen
        name="my-practice"
        options={{
          title: t('practice.module'),
          tabBarLabel: tabLabel(t('tabs.practice')),
          // The khol says "Practice" to screen readers through the tab's name (#671).
          tabBarAccessibilityLabel: t('tabs.practice'),
          tabBarIcon: tabIcon('practice'),
        }}
      />
      <Tabs.Screen name="me" options={{ title: t('tabs.me'), tabBarLabel: tabLabel(t('tabs.me')), tabBarAccessibilityLabel: t('tabs.me'), tabBarIcon: tabIcon('person') }} />
    </Tabs>
  );
}
