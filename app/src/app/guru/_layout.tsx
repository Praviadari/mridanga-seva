// Screens for the Guru role. Open only when useAuth().area is 'guru' (src/app/_layout.tsx).
// A plain stack for now; becomes tabs as the Guru screens are built.

import { Stack } from 'expo-router';

/** Navigator for the Guru screens. */
export default function GuruLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
