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

/** The one query kept with it (keptQuery), e.g. '?ids=…', or ''. */
let requestedQuery = '';

/** A record id (a UUID), the only thing keptQuery lets through. */
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** At most this many ids are kept: a printed sheet holds far fewer, and the address stays short. */
const MAX_KEPT_IDS = 300;

/**
 * The part of a query kept through sign-in, else ''. Only Print QR cards' preselected students
 * (`/staff/qr-cards?ids=<id>,<id>`, opened from the phone app in the browser) are kept (audit R2-08,
 * docs/DECISIONS.md #306): without them the coordinator signs in on the web and finds nobody chosen. Only
 * record ids pass, so nothing else in an address (a sign-in token) is ever kept.
 * @param path the path the query came with (pathOnly's answer).
 * @param search the address's query, with or without its '?'.
 */
export function keptQuery(path: string | null, search: string): string {
  if (path !== '/staff/qr-cards') return '';
  let ids: string | null = null;
  try {
    ids = new URLSearchParams(search).get('ids');
  } catch {
    return '';
  }
  const kept = (ids ?? '').split(',').filter((id) => RECORD_ID.test(id)).slice(0, MAX_KEPT_IDS);
  return kept.length > 0 ? `?ids=${kept.join(',')}` : '';
}

/**
 * Keeps only the path of an address: no query and no '#' part, which can carry sign-in tokens
 * (password-reset links), and no trailing slash. The path is normalised before anything compares
 * it (D3-12): decoded once ('%2e%2e' is '..'), '\' read as '/', repeated slashes collapsed, '.' and
 * '..' resolved (never above the start page); one with control characters counts as nothing asked
 * for. The start page '/' counts as nothing asked for.
 */
export function pathOnly(address: string): string | null {
  let raw = address.split(/[?#]/)[0];
  try {
    raw = decodeURIComponent(raw).split(/[?#]/)[0];
  } catch {
    // A broken %-sequence: the address is used as it is.
  }
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  const segments: string[] = [];
  for (const segment of raw.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.length === 0 ? null : `/${segments.join('/')}`;
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
  if (typeof window !== 'undefined') {
    requested = pathOnly(window.location.pathname);
    requestedQuery = keptQuery(requested, window.location.search ?? '');
  }
} else {
  void Linking.getInitialURL()
    .then((url) => {
      if (url && requested === null) requested = pathOfAppLink(url);
    })
    // No link could be read: the app opens its home screen (D3-12).
    .catch(() => undefined);
}

/**
 * Remembers a screen to open once the person's area is known, e.g. the announcement a push
 * notification was about. `path` is an address inside the app, such as '/student/announcements/12'.
 */
export function rememberRequestedPath(path: string): void {
  requested = pathOnly(path);
  requestedQuery = '';
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
    // The website's "Register" link and a shared "Forgot password" link open those screens, not sign-in (audit 22-10-2026
    // fix 9, docs/DECISIONS.md #514).
    case 'signedOut':
      return path === '/sign-up' || path === '/forgot-password';
    // A login waiting for the desk: the practice screens it may use (#510).
    case 'pending':
      return path === '/waiting' || path.startsWith('/waiting/');
    default:
      return false;
  }
}

/**
 * The remembered path, when it is a screen of `area`, with its kept query (keptQuery); otherwise null.
 * Does not forget it: call forgetRequestedPath once the person is signed in (see src/app/index.tsx).
 */
export function requestedPathFor(area: Area): string | null {
  return requested && belongsTo(requested, area) ? requested + requestedQuery : null;
}

/**
 * Forgets the remembered path. Called as soon as the person is signed in with a known area,
 * whether it was used or not, so a later sign-out and sign-in lands on the home screen. While
 * signed out it is kept, so a link opened before signing in still works after it.
 */
export function forgetRequestedPath(): void {
  requested = null;
  requestedQuery = '';
}
