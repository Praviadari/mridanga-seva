// Remembers which screen a person asked for when the app was opened with a link: a web address
// typed, bookmarked or shared (for example /student/announcements/12), an Android link, or a tap
// on a push notification (src/lib/push.ts). src/app/index.tsx sends them there once their login
// has been checked, instead of to their area's home screen.
//
// Why it is needed: while the login is being checked the area is 'loading' and every area's
// screens are closed (src/app/_layout.tsx, Stack.Protected), so Expo Router sends the link to the
// start page first, and the address is lost (docs/DECISIONS.md #30).

import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

import type { Area } from './types';

/** The path asked for, e.g. '/student/announcements/12', or null. */
let requested: string | null = null;

/**
 * Keeps only the path of an address: no query and no '#' part, which can carry sign-in tokens
 * (password-reset links), and no trailing slash. The start page '/' counts as nothing asked for.
 */
function pathOnly(address: string): string | null {
  const path = `/${address.split(/[?#]/)[0].replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return path === '/' ? null : path;
}

/**
 * The path in a link that opened the app on a phone, the way Expo Router reads it:
 * 'mridangaseva://student/announcements/12' and, in Expo Go, 'exp://host/--/student/...' both
 * give '/student/announcements/12'.
 */
function pathOfAppLink(url: string): string | null {
  const expoGo = /\/--\/(.*)$/.exec(url);
  if (expoGo) return pathOnly(expoGo[1]);
  if (/^https?:\/\//.test(url)) {
    // A malformed address opens the home screen instead of failing unseen (D6-16).
    try {
      return pathOnly(new URL(url).pathname);
    } catch {
      return null;
    }
  }
  return pathOnly(url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''));
}

// Read once, when the app starts: this file is loaded with the screens, before the router has
// moved away from the address it was opened with.
if (Platform.OS === 'web') {
  if (typeof window !== 'undefined') requested = pathOnly(window.location.pathname);
} else {
  void Linking.getInitialURL().then((url) => {
    if (url && requested === null) requested = pathOfAppLink(url);
  });
}

/**
 * Remembers a screen to open once the person's area is known, e.g. the announcement a push
 * notification was about. `path` is an address inside the app, such as '/student/announcements/12'.
 */
export function rememberRequestedPath(path: string): void {
  requested = pathOnly(path);
}

/**
 * True when a screen at `path` belongs to `area`, so the person may open it. Also used for a tap
 * on a push notification while the app is open (src/lib/push.ts).
 */
export function belongsTo(path: string, area: Area): boolean {
  switch (area) {
    case 'student':
      return path === '/student' || path.startsWith('/student/');
    case 'guru':
    case 'coordinator':
      // staff/ is shared by the Guru and coordinators, home included (docs/DECISIONS.md #36).
      return path === '/staff' || path.startsWith('/staff/');
    case 'subscriber':
      return path.startsWith('/subscriber/');
    default:
      return false;
  }
}

/**
 * The remembered path, when it is a screen of `area`; otherwise null. Does not forget it: call
 * forgetRequestedPath once the person is signed in (see src/app/index.tsx).
 */
export function requestedPathFor(area: Area): string | null {
  return requested && belongsTo(requested, area) ? requested : null;
}

/**
 * Forgets the remembered path. Called as soon as the person is signed in with a known area,
 * whether it was used or not, so a later sign-out and sign-in lands on the home screen. While
 * signed out it is kept, so a link opened before signing in still works after it.
 */
export function forgetRequestedPath(): void {
  requested = null;
}
