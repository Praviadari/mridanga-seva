// Screens shared by the Guru and coordinators: registering students, attendance, follow-up and
// the other coordinator screens (C2-C21 in docs/SCREENS.md), plus the staff home. The Guru "sees
// all coordinator screens", so they live here once instead of twice. Open only when
// useAuth().area is 'guru' or 'coordinator' (src/app/_layout.tsx); the database checks every
// action again. The home and the four screens used most are tabs ((tabs)/_layout.tsx); the rest
// open on top of the tabs with a back button.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import { headerBarOptions, useTheme } from '@/theme/use-theme';

/**
 * The tabs sit under any staff screen opened straight from a link (web address, push
 * notification), so Back leads to them instead of out of the app (docs/DECISIONS.md #30, #36).
 */
export const unstable_settings = { anchor: '(tabs)' };

/** Navigator for staff screens: the tabs, and saffron header bars with a back button above them. */
export default function StaffLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <>
      {/* Light status-bar icons on the saffron headers. */}
      <StatusBar style="light" />
      <Stack screenOptions={headerBarOptions(colors)}>
        {/* No bar of its own (the tabs have theirs); the title is what Back says on the next screen. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('home.title') }} />
      </Stack>
    </>
  );
}
