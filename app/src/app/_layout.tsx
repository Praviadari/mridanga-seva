// Root of the app: loads translations, keeps the splash screen up while the login is checked,
// and shows only the screens the signed-in person's role may use.
//
// How role-based navigation works (docs/ARCHITECTURE.md "Navigation by role"):
// useAuth().area names the part of the app the person may use. Each <Stack.Protected> below
// lists one area's screens; screens whose guard is false cannot be opened, and a person on such
// a screen is sent to `index`, which forwards them to their area's first screen.
// The database still checks every read and write (row-level security); hiding screens here is
// for a clear interface, not for security.

import '@/i18n'; // sets up translations before any screen renders
import '@/auth/requested-path'; // notes the address the app was opened with, before any redirect

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { SetupNeeded } from '@/components/setup-needed';
import { supabaseConfigProblem } from '@/lib/supabase';
import { useTheme } from '@/theme/use-theme';

// Keep the native splash screen until we know where to send the person. Must run at the top
// level, before the first render (expo-splash-screen docs).
SplashScreen.preventAutoHideAsync();

/** App root. Expo Router renders it around every screen. */
export default function RootLayout() {
  const { isDark } = useTheme();
  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      {supabaseConfigProblem ? (
        <>
          <HideSplash when />
          <SetupNeeded problem={supabaseConfigProblem} />
        </>
      ) : (
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      )}
    </ThemeProvider>
  );
}

/** The screen stack, with each group of screens open only to the matching area. */
function RootNavigator() {
  const { area } = useAuth();
  const { colors } = useTheme();

  return (
    <>
      <HideSplash when={area !== 'loading'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Always open: shows the splash while loading, then forwards to the area's first screen. */}
        <Stack.Screen name="index" />

        <Stack.Protected guard={area === 'signedOut'}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>

        <Stack.Protected guard={area === 'recovery'}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>

        <Stack.Protected guard={area === 'pending'}>
          <Stack.Screen name="pending" />
        </Stack.Protected>

        <Stack.Protected guard={area === 'guru'}>
          <Stack.Screen name="guru" />
        </Stack.Protected>

        <Stack.Protected guard={area === 'coordinator'}>
          <Stack.Screen name="coordinator" />
        </Stack.Protected>

        {/* Coordinator screens the Guru uses too (register, attendance, follow-up ...). */}
        <Stack.Protected guard={area === 'guru' || area === 'coordinator'}>
          <Stack.Screen name="staff" />
        </Stack.Protected>

        <Stack.Protected guard={area === 'student'}>
          <Stack.Screen name="student" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Hides the native splash screen once `when` becomes true. Renders nothing. */
function HideSplash({ when }: { when: boolean }) {
  useEffect(() => {
    if (when) SplashScreen.hide();
  }, [when]);
  return null;
}
