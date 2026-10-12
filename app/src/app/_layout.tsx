// BRANCH p3-spike ONLY — NEVER MERGE (Phase 3 P3-0 native face spike, docs/phase3/SPIKE_RESULT.md).
// On this branch the root shows the face spike test app instead of the class app: no sign-in, no server,
// no push. The class app's screens stay in the tree (and in the APK) so the build proves that the face
// packages live alongside every native module the real app ships. main's _layout.tsx is the real one.

import { type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SpikeApp } from '@/spike/spike-app';

/** A crash shows the error and Try again (the class app's crash screen needs its translations and login). */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>The face spike crashed</Text>
        <Text selectable>{String(error?.stack ?? error)}</Text>
        <Pressable onPress={retry} style={{ padding: 14, backgroundColor: '#5B21B6', borderRadius: 8 }}>
          <Text style={{ color: '#fff', textAlign: 'center' }}>Try again</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <SpikeApp />
    </>
  );
}
