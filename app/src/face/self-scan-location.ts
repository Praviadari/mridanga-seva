// Face self-scan (Phase 3 P3-5, docs/DECISIONS.md #212, #345): the ONE position read for a check-in or check-out,
// at the student's tap, in the foreground, at most LOCATION_TIMEOUT_MS (8 s). Never a position kept from earlier
// (src/lib/attendance-location.ts reuses one for a queue at the desk; a self-scan must be where the student is
// now), never in the background, never stored: it goes with the self_scan call, and the server keeps only the
// result and the distance (0064). Android reports a mocked position (developer options, fake-GPS apps): it is
// passed on and refused. Never throws.
// Docs: https://docs.expo.dev/versions/v57.0.0/sdk/location/

import * as Location from 'expo-location';

import { LOCATION_TIMEOUT_MS } from './face-settings';
import type { PhonePosition } from './self-scan-rules';

/** Resolves to null after `ms`. */
function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/** The phone's position now, asking for the permission (foreground only) when it has not been asked yet. */
export async function readOnePosition(): Promise<PhonePosition> {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'refused' };
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null),
      timeout(LOCATION_TIMEOUT_MS),
    ]);
    if (!position) return { status: 'no_fix' };
    return {
      status: 'fix',
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
      mocked: position.mocked === true,
    };
  } catch {
    return { status: 'no_fix' };
  }
}
