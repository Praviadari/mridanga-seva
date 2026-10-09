// The subscriber's two tabs: Ishtagoshti (I1) and My account (name, language, leave, sign out).
// Always at the bottom, like the student's (docs/DECISIONS.md #36).

import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { tabIcon } from '@/components/icon';
import { documentTitleLayout } from '@/lib/document-title';
import { tabsScreenOptions, useTheme } from '@/theme/use-theme';

/** Tab navigator for the subscriber screens. */
export default function SubscriberTabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs screenLayout={documentTitleLayout} screenOptions={tabsScreenOptions(colors, false, fontScale)}>
      <Tabs.Screen
        name="ishtagoshti"
        options={{ title: t('ishtagoshti.title'), tabBarLabel: t('tabs.ishtagoshti'), tabBarIcon: tabIcon('ishtagoshti') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('subscriberAccount.title'), tabBarLabel: t('tabs.account'), tabBarIcon: tabIcon('profile') }}
      />
    </Tabs>
  );
}