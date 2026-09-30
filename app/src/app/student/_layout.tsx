// Screens for the Student role. Open only when useAuth().area is 'student' (src/app/_layout.tsx).
// A plain stack for now; becomes tabs as the Student screens are built. The home screen has no
// header bar; screens opened from it (My QR ...) get one with a title and a back button.

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/use-theme';

/**
 * The student home screen sits under any student screen opened straight from a link (web
 * address, later a push notification), so Back leads home instead of out of the app
 * (src/app/index.tsx, docs/DECISIONS.md #30).
 */
export const unstable_settings = { anchor: 'index' };

/** Navigator for the Student screens. */
export default function StudentLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}>
      {/* The title is not shown here; screen readers say it on the Back button of the next screen. */}
      <Stack.Screen name="index" options={{ headerShown: false, title: t('home.title') }} />
    </Stack>
  );
}
