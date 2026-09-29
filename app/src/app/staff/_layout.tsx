// Screens shared by the Guru and coordinators: registering students, attendance, follow-up and
// the other coordinator screens (C2-C21 in docs/SCREENS.md). The Guru "sees all coordinator
// screens", so they live here once instead of twice. Open only when useAuth().area is 'guru' or
// 'coordinator' (src/app/_layout.tsx); the database checks every action again.

import { Stack } from 'expo-router';

import { useTheme } from '@/theme/use-theme';

/** Navigator for staff screens: each has a header bar with its title and a back button. */
export default function StaffLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
