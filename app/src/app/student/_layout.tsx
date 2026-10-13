// Screens for the Student role. Open only when useAuth().area is 'student' (src/app/_layout.tsx).
// Home, My QR and Announcements are tabs ((tabs)/_layout.tsx); one announcement opens on top of
// them with a saffron header bar and a back button.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { useFaceStatus } from '@/face/face-status';
import { documentTitleLayout } from '@/lib/document-title';
import { useHeadingFont } from '@/theme/fonts';
import { headerBarOptions, useTheme } from '@/theme/use-theme';

/**
 * The tabs sit under any student screen opened straight from a link (web address, push
 * notification), so Back leads home instead of out of the app (src/app/index.tsx,
 * docs/DECISIONS.md #30, #36).
 */
export const unstable_settings = { anchor: '(tabs)' };

/** Navigator for the Student screens. */
export default function StudentLayout() {
  const { colors } = useTheme();
  const titleFont = useHeadingFont();
  const { t } = useTranslation();
  const { profile } = useAuth();
  // Face scan (Phase 3, #310): at every start, ask the server about this phone's enrolment and apply the
  // wipe rule (src/face/face-status.ts). Nothing on the web, and nothing to see while face scan is off.
  useFaceStatus(profile?.id);
  return (
    <>
      {/* Light status-bar icons on the saffron headers. */}
      <StatusBar style="light" />
      <Stack screenLayout={documentTitleLayout} screenOptions={headerBarOptions(colors, titleFont)}>
        {/* No bar of its own (the tabs have theirs); the title is what Back says on the next screen. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('home.title') }} />
      </Stack>
    </>
  );
}
