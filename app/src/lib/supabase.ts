// The one Supabase client the whole app uses to talk to the database and to log in.
// Settings: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY, from app/.env.development (the
// TEST project) under `npx expo start`, and handed in by scripts/export-web.mjs and
// scripts/publish-update.mjs for builds (app/README.md "Settings files", docs/DECISIONS.md #145).
// See docs/ARCHITECTURE.md "Security model".
//
// Setup follows the Expo guide for SDK 57: https://docs.expo.dev/guides/using-supabase/

import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { readLocal, removeLocal } from './local-storage'; // also provides `localStorage` on Android and iOS

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

/** Called when the database refuses a call as not allowed; set by the auth provider. */
let onRefused: (() => void) | null = null;

/**
 * Lets the auth provider hear about refused calls, so a login switched off (or given another role)
 * while the app is open loses its screens at once instead of at the next start (docs/DECISIONS.md #99).
 * @param listener called (not awaited) after a refused call; null stops it.
 */
export function setRefusedListener(listener: (() => void) | null): void {
  onRefused = listener;
}

/**
 * fetch for the client: answers as usual, and when the database or Storage refused the call as not
 * allowed (permission code 42501, or the functions' own "not_allowed" / "not allowed"), tells the
 * listener. Sign-in calls (/auth/) are left out: a wrong password is not a lost role.
 */
const watchedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (onRefused && response.status >= 400 && response.status < 500 && !address.includes('/auth/v1/')) {
    response
      .clone()
      .text()
      .then((body) => {
        if (/42501|not[ _]allowed|row-level security/.test(body)) onRefused?.();
      })
      .catch(() => undefined);
  }
  return response;
};

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
    global: { fetch: watchedFetch },
  },
);

/**
 * Where the client keeps the login on this device: Supabase's default key, made from the first
 * part of the project's address ("sb-fhuqyk…-auth-token"). Not set explicitly above, because a
 * different key would sign everybody out.
 */
const LOGIN_KEY = supabaseConfigProblem ? null : `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

/**
 * The user id of the login saved on this device, or null when there is none. The auth client
 * reports "no session" at start when the saved login's access token has expired and it cannot
 * reach the server to refresh it (no internet), although the login is still saved and works
 * again once there is a connection. The auth provider uses this to tell that case from a real
 * sign-out (docs/DECISIONS.md #42).
 */
export function storedLoginUserId(): string | null {
  const text = LOGIN_KEY ? readLocal(LOGIN_KEY) : null;
  if (!text) return null;
  try {
    const login = JSON.parse(text) as { refresh_token?: unknown; user?: { id?: unknown } };
    return typeof login.refresh_token === 'string' && typeof login.user?.id === 'string' ? login.user.id : null;
  } catch {
    return null;
  }
}

/**
 * Deletes the login saved on this device without asking the server. Only for signing out with
 * no internet, when the auth client itself keeps the login (src/auth/auth-actions.ts signOut).
 */
export function forgetStoredLogin(): void {
  if (LOGIN_KEY) removeLocal(LOGIN_KEY);
}

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
