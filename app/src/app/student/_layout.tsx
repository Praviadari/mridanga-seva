// Screens for the Student role. Open only when useAuth().area is 'student' (src/app/_layout.tsx).
// A plain stack for now; becomes tabs as the Student screens are built.

import { Stack } from 'expo-router';

/** Navigator for the Student screens. */
export default function StudentLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
