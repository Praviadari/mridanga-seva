// The one Supabase client the whole app uses to talk to the database and to log in.
// Settings come from app/.env (copy app/.env.example): EXPO_PUBLIC_SUPABASE_URL and
// EXPO_PUBLIC_SUPABASE_KEY. See docs/ARCHITECTURE.md "Security model".
//
// Setup follows the Expo guide for SDK 57: https://docs.expo.dev/guides/using-supabase/

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import './local-storage'; // provides `localStorage` on Android and iOS for the client below

// Expo copies EXPO_PUBLIC_* values into the app when it is built, so they are public. That is
// fine for the URL and the publishable (anon) key, because row-level security guards the data.
// Write process.env.EXPO_PUBLIC_... in full here: Expo only replaces the literal expression.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/**
 * Why the app cannot connect, or null when the settings look right. The root layout shows a
 * setup message instead of the app when this is not null, so a missing key gives a clear
 * explanation rather than a crash.
 */
export const supabaseConfigProblem: 'missing' | 'secretKey' | null = checkConfig(url, key);

function checkConfig(u: string, k: string): 'missing' | 'secretKey' | null {
  if (!u.startsWith('https://') || k.length === 0) return 'missing';
  // The secret (service_role) key bypasses every access rule. Refuse to run with it, because
  // anything in EXPO_PUBLIC_* ends up inside the app and the public web version.
  if (k.startsWith('sb_secret_') || jwtRole(k) === 'service_role') return 'secretKey';
  return null;
}

/** Reads the `role` claim from an older-style JWT key (anon / service_role); null otherwise. */
function jwtRole(k: string): string | null {
  const payload = k.split('.')[1];
  if (!payload) return null;
  try {
    // JWTs use unpadded base64url; convert to padded base64, which every atob accepts.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return (JSON.parse(json) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

/**
 * The shared client. When the settings are missing it points at a dummy address and is never
 * used (see supabaseConfigProblem), which keeps every import of this file safe.
 */
export const supabase = createClient(
  supabaseConfigProblem ? 'https://not-configured.invalid' : url,
  supabaseConfigProblem ? 'not-configured' : key,
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Only the web version opens links from emails (confirm sign-up, reset password), which
      // arrive with the login in the address. Android and iOS have no address to read.
      detectSessionInUrl: Platform.OS === 'web',
      // 'implicit' (not 'pkce') so a password-reset link asked for on a phone still works
      // when it is opened in a browser: PKCE would need a secret kept on the phone.
      flowType: 'implicit',
    },
  },
);

// On phones, refresh the login token only while the app is on screen. The web client already
// pauses itself when the browser tab is hidden.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
