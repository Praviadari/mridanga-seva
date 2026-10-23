// Root of the app: loads translations, keeps the splash screen up while the login is checked (handing over to
// the app's own splash with "Taking long, try again" when that takes long; src/lib/slow-start.ts),
// shows only the screens the signed-in person's role may use, sets up push notifications on the
// Android app (src/lib/push.ts) and looks for app updates when it comes back to the front
// (src/lib/app-update.ts). A screen that crashes shows a friendly page with Try again instead of a blank one
// (ErrorBoundary below, src/components/crash-screen.tsx; D10-17).
//
// How role-based navigation works (docs/ARCHITECTURE.md "Navigation by role"):
// useAuth().area names the part of the app the person may use. Each <Stack.Protected> below
// lists one area's screens; screens whose guard is false cannot be opened, and a person on such
// a screen is sent to `index`, which forwards them to their area's first screen.
// The database still checks every read and write (row-level security); hiding screens here is
// for a clear interface, not for security.

import { useLanguageReady } from '@/i18n'; // sets up translations before any screen renders
import '@/auth/requested-path'; // notes the address the app was opened with, before any redirect

import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/auth-provider';
import { BrandSplash } from '@/components/brand';
import { CrashScreen } from '@/components/crash-screen';
import { KeyboardRoot } from '@/components/keyboard';
import { SetupNeeded } from '@/components/setup-needed';
import { useUpdateChecks } from '@/lib/app-update';
import { documentTitleLayout } from '@/lib/document-title';
import { forgetOfflineShell, keepOfflineShell } from '@/lib/offline-shell';
import { registerForPush, usePushTaps } from '@/lib/push';
import { pushNeedsRetry } from '@/lib/push-state';
import { useTakingLong } from '@/lib/slow-start';
import { supabaseConfigProblem } from '@/lib/supabase';
import { HeadingFontProvider } from '@/theme/fonts';
import { useTheme } from '@/theme/use-theme';

// Keep the native splash screen until we know where to send the person. Must run at the top
// level, before the first render (expo-splash-screen docs).
SplashScreen.preventAutoHideAsync();

/**
 * Expo Router shows this in place of the app when anything below the root throws while rendering (D10-17,
 * docs/DECISIONS.md #216): the person's language, Try again, the way home, Restart the app, the version and
 * the error line. A crash in the first seconds of a downloaded update goes on to expo-updates instead, so a
 * bad update is rolled back (#294, src/lib/crash-recovery.ts).
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <CrashScreen {...props} />;
}

/** App root. Expo Router renders it around every screen. */
export default function RootLayout() {
  const { colors, isDark } = useTheme();
  useUpdateChecks();
  // The web downloads Telugu or Hindi on its own (#331): the splash stays over the app until it is in.
  const languageReady = useLanguageReady();
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
    // Follows the phone keyboard for every page (components/keyboard.tsx, docs/DECISIONS.md #269). The heading
    // font loads at run time and never holds the splash (theme/fonts.tsx, #337).
    <HeadingFontProvider>
      <KeyboardRoot>
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
          {languageReady ? null : (
            <View style={StyleSheet.absoluteFill}>
              <BrandSplash />
            </View>
          )}
        </ThemeProvider>
      </KeyboardRoot>
    </HeadingFontProvider>
  );
}

/** The screen stack, with each group of screens open only to the matching area. */
function RootNavigator() {
  const { area } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  // A slow start hides the native splash, so the app's own (src/app/index.tsx) can say so (docs/DECISIONS.md #237).
  const slow = useTakingLong(area === 'loading');

  return (
    <>
      <HideSplash when={area !== 'loading' || slow} />
      <PushSetup />
      <OfflineShell />
      {/* The titles here have no header bar: they name the web page (src/lib/document-title.tsx). */}
      <Stack
        screenLayout={documentTitleLayout}
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Always open: shows the splash while loading, then forwards to the area's first screen. */}
        <Stack.Screen name="index" />
        {/* Always open too: an asset label's link (/i/<token>) forwards by area and shows nothing itself. */}
        <Stack.Screen name="i/[token]" />
        {/* Always open too: a parent's consent page for a child who signed up at home (#399), signed in or not. */}
        <Stack.Screen name="parent-consent" options={{ title: t('parentConsent.title') }} />

        <Stack.Protected guard={area === 'signedOut'}>
          <Stack.Screen name="sign-in" options={{ title: t('signIn.title') }} />
          <Stack.Screen name="sign-up" options={{ title: t('signUp.title') }} />
          <Stack.Screen name="forgot-password" options={{ title: t('forgotPassword.title') }} />
        </Stack.Protected>

        <Stack.Protected guard={area === 'recovery'}>
          <Stack.Screen name="reset-password" options={{ title: t('resetPassword.title') }} />
        </Stack.Protected>

        <Stack.Protected guard={area === 'pending'}>
          <Stack.Screen name="pending" options={{ title: t('pending.title') }} />
          {/* I14: a login without a class role joins Ishtagoshti, or types the parent's code. */}
          <Stack.Screen name="join-ishtagoshti" options={{ title: t('pending.igTitle') }} />
          {/* Step 2 of joining, while waiting for the desk (docs/DECISIONS.md #164). */}
          <Stack.Screen name="about-you" options={{ title: t('about.title') }} />
          {/* Practice while waiting: tools, mantra, Beginner lessons (0057, docs/DECISIONS.md #510). */}
          <Stack.Screen name="waiting" />
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
 * A refused permission or a failed registration is tried again, without asking again, each time the
 * app comes back to the front (audit R5-04, docs/DECISIONS.md #305).
 */
function PushSetup() {
  const { area, profile } = useAuth();
  const profileId = profile?.id;
  const signedIn = Boolean(profileId) && (area === 'guru' || area === 'coordinator' || area === 'student');
  usePushTaps(area);
  useEffect(() => {
    if (!signedIn) return;
    void registerForPush();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && pushNeedsRetry()) void registerForPush({ ask: false });
    });
    return () => subscription.remove();
  }, [signedIn, profileId]);
  return null;
}

/**
 * The web version offline (src/lib/offline-shell.web.ts, docs/DECISIONS.md #513): the service worker is registered once
 * someone is signed in, and removed with what it kept whenever the app is signed out. Does nothing on phones. Renders
 * nothing.
 */
function OfflineShell() {
  const { area } = useAuth();
  const signedIn = area === 'pending' || area === 'guru' || area === 'coordinator' || area === 'student' || area === 'subscriber';
  useEffect(() => {
    if (signedIn) keepOfflineShell();
    else if (area === 'signedOut') void forgetOfflineShell();
  }, [signedIn, area]);
  return null;
}

/** Hides the native splash screen once `when` becomes true. Renders nothing. */
function HideSplash({ when }: { when: boolean }) {
  useEffect(() => {
    if (when) SplashScreen.hide();
  }, [when]);
  return null;
}
