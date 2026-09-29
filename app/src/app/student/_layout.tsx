// Screens for the Student role. Open only when useAuth().area is 'student' (src/app/_layout.tsx).
// A plain stack for now; becomes tabs as the Student screens are built. The home screen has no
// header bar; screens opened from it (My QR ...) get one with a title and a back button.

import { Stack } from 'expo-router';

import { useTheme } from '@/theme/use-theme';

/** Navigator for the Student screens. */
export default function StudentLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
