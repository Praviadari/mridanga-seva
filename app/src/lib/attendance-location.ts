// Where the marking phone is, for the attendance check at check-in (docs/DECISIONS.md #70). When a
// coordinator or the Guru checks a student in (scan or tap), the app sends the phone's position
// with the call; the database compares it with the centre's area and keeps only the distance and
// the result (migration 0024). Nothing here blocks marking: every failure becomes a reason that
// the visit is flagged for, and the visit is saved anyway.
//
// - Foreground permission only, asked the first time it is needed (app.json holds the text the
//   phone shows: only while the app is open, to confirm you are at the class).
// - A fix younger than FIX_MAX_AGE_MS is reused, so a queue at the door is not slowed down; the
//   attendance screen warms it up on opening when the permission is already given.
// - No fix within FIX_TIMEOUT_MS (indoors, location switched off) = 'no_fix', and 'no_fix' at once for the
//   next minute (NO_FIX_RETRY_MS) instead of waiting again for each student.
// - The web version uses the browser's location (expo-location wraps navigator.geolocation);
//   a browser without it = 'no_location'.
// Docs: https://docs.expo.dev/versions/v57.0.0/sdk/location/

import * as Location from 'expo-location';
import { Platform } from 'react-native';

/** What is sent to mark_visit / scan_qr as p_location. */
export type PhoneLocation =
  | { status: 'fix'; lat: number; lng: number; accuracy: number | null }
  | { status: 'refused' | 'no_fix' | 'no_location' };

/** How long to wait for a position before the visit is saved as 'no_fix'. */
export const FIX_TIMEOUT_MS = 8_000;
/** A position this recent is used again for the next student. */
const FIX_MAX_AGE_MS = 2 * 60_000;

let lastFix: { location: PhoneLocation; at: number } | null = null;

function hasBrowserLocation(): boolean {
  return Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'geolocation' in navigator);
}

/** Resolves to null after `ms`, so a slow position request cannot hold up marking. */
function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

function toLocation(position: Location.LocationObject): PhoneLocation {
  return {
    status: 'fix',
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
  };
}

/**
 * After a read that got no fix in time, the next reads within this time answer 'no_fix' at once instead
 * of waiting FIX_TIMEOUT_MS again, so a queue at the door in a hall without a fix pays the wait at most
 * once a minute (audit R2-04, docs/DECISIONS.md #293). A fix that arrives late is still kept.
 */
const NO_FIX_RETRY_MS = 60_000;
let lastNoFix = 0;

/**
 * The reading under way, if any: the warm-up on "Scan the next student" starts one, and the scan a few
 * seconds later joins it and waits only the time it has left, instead of starting a second reading
 * with a fresh 8 s limit (audit phase 4 P5-10, docs/DECISIONS.md #330).
 */
let inFlight: { reading: Promise<PhoneLocation | null>; startedAt: number } | null = null;

/** A fresh position (or a recent one the phone already has); null when none came in time. */
async function readPosition(): Promise<PhoneLocation | null> {
  if (lastFix && Date.now() - lastFix.at < FIX_MAX_AGE_MS) return lastFix.location;
  if (Date.now() - lastNoFix < NO_FIX_RETRY_MS) return null;
  if (inFlight) {
    const left = FIX_TIMEOUT_MS - (Date.now() - inFlight.startedAt);
    const location = left > 0 ? await Promise.race([inFlight.reading, timeout(left)]) : null;
    if (!location) lastNoFix = Date.now();
    return location;
  }
  const reading = (async () => {
    const known = await Location.getLastKnownPositionAsync({ maxAge: FIX_MAX_AGE_MS, requiredAccuracy: 200 }).catch(() => null);
    return known ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  })()
    .then((position) => {
      // Also when it comes after the time limit: the next student's check-in uses it.
      const location = toLocation(position);
      lastFix = { location, at: Date.now() };
      lastNoFix = 0;
      return location;
    })
    .catch(() => null)
    .finally(() => {
      if (inFlight?.reading === reading) inFlight = null;
    });
  inFlight = { reading, startedAt: Date.now() };
  const location = await Promise.race([reading, timeout(FIX_TIMEOUT_MS)]);
  if (!location) lastNoFix = Date.now();
  return location;
}

/**
 * The phone's position for a check-in, asking for the permission when it has not been asked yet.
 * Never throws: a refusal, a timeout or a browser without location gives the matching status.
 */
export async function locationForCheckIn(): Promise<PhoneLocation> {
  if (!hasBrowserLocation()) return { status: 'no_location' };
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return { status: 'refused' };
    return (await readPosition()) ?? { status: 'no_fix' };
  } catch {
    // The web version without a secure page, or a phone without location services.
    return { status: Platform.OS === 'web' ? 'no_location' : 'no_fix' };
  }
}

/**
 * Starts reading the position in the background when the permission is already given, so the
 * first check-in does not wait for it. Never asks for the permission; does nothing otherwise.
 */
export function warmUpLocation(): void {
  if (!hasBrowserLocation()) return;
  void Location.getForegroundPermissionsAsync()
    .then((permission) => (permission.granted ? readPosition() : null))
    .catch(() => null);
}

/** Whether this phone's answer is already known to be "refused" (for the note on C5). */
export async function locationRefused(): Promise<boolean> {
  if (!hasBrowserLocation()) return false;
  const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
  return !!permission && !permission.granted && !permission.canAskAgain;
}
