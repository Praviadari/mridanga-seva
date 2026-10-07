// Root of the app: loads translations, keeps the splash screen up while the login is checked,
// shows only the screens the signed-in person's role may use, sets up push notifications on the
// Android app (src/lib/push.ts) and looks for app updates when it comes back to the front
// (src/lib/app-update.ts).
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
import { useUpdateChecks } from '@/lib/app-update';
import { registerForPush, usePushTaps } from '@/lib/push';
import { supabaseConfigProblem } from '@/lib/supabase';
import { useTheme } from '@/theme/use-theme';

// Keep the native splash screen until we know where to send the person. Must run at the top
// level, before the first render (expo-splash-screen docs).
SplashScreen.preventAutoHideAsync();

/** App root. Expo Router renders it around every screen. */
export default function RootLayout() {
  const { colors, isDark } = useTheme();
  useUpdateChecks();
  // The navigators' own colours (tab bar, sidebar, header) from our palette instead of their
  // default blue (docs/DECISIONS.md #36).
  const base = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.cardBorder,
    },
  };
  return (
    <ThemeProvider value={navigationTheme}>
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
      <PushSetup />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Always open: shows the splash while loading, then forwards to the area's first screen. */}
        <Stack.Screen name="index" />
        {/* Always open too: an asset label's link (/i/<token>) forwards by area and shows nothing itself. */}
        <Stack.Screen name="i/[token]" />

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
          {/* I14: a login without a class role joins Ishtagoshti, or types the parent's code. */}
          <Stack.Screen name="join-ishtagoshti" />
        </Stack.Protected>

        {/* The staff home (G1 for the Guru, C1 for a coordinator) and the coordinator screens the
            Guru uses too (register, attendance, follow-up ...). */}
        <Stack.Protected guard={area === 'guru' || area === 'coordinator'}>
          <Stack.Screen name="staff" />
        </Stack.Protected>

        <Stack.Protected guard={area === 'student'}>
          <Stack.Screen name="student" />
        </Stack.Protected>

        {/* A public Ishtagoshti subscriber: sloka study and its own account only (docs/DECISIONS.md #88). */}
        <Stack.Protected guard={area === 'subscriber'}>
          <Stack.Screen name="subscriber" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/**
 * Push notifications on the Android app (src/lib/push.ts): once a student, coordinator or the
 * Guru is signed in, asks for permission and saves the phone's token; opens the announcement when
 * a notification is tapped. Does nothing on the web or while push is not set up. Renders nothing.
 */
function PushSetup() {
  const { area, profile } = useAuth();
  const profileId = profile?.id;
  usePushTaps(area);
  useEffect(() => {
    if (profileId && (area === 'guru' || area === 'coordinator' || area === 'student')) void registerForPush();
  }, [area, profileId]);
  return null;
}

/** Hides the native splash screen once `when` becomes true. Renders nothing. */
function HideSplash({ when }: { when: boolean }) {
  useEffect(() => {
    if (when) SplashScreen.hide();
  }, [when]);
  return null;
}
