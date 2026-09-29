// Screens for the Coordinator role. Open only when useAuth().area is 'coordinator' (src/app/_layout.tsx).
// A plain stack for now; becomes tabs as the Coordinator screens are built.

import { Stack } from 'expo-router';

/** Navigator for the Coordinator screens. */
export default function CoordinatorLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
