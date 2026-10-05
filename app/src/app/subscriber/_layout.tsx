// Screens for a public Ishtagoshti subscriber (Phase 2 slice 7, docs/DECISIONS.md #88): a login with no
// class role that joined the free sloka study (I14). Open only when useAuth().area is 'subscriber'
// (src/app/_layout.tsx). Two tabs (Slokas, My account, (tabs)/_layout.tsx); a sloka, a theme and the
// list of all slokas open on top with a back button. The database lets such a login read published
// slokas and themes and keep its own notes and ticks, nothing else.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import { headerBarOptions, useTheme } from '@/theme/use-theme';

/** The tabs sit under any subscriber screen opened from a link, so Back leads to them. */
export const unstable_settings = { anchor: '(tabs)' };

/** Navigator for the subscriber screens. */
export default function SubscriberLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={headerBarOptions(colors)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('ishtagoshti.title') }} />
      </Stack>
    </>
  );
}