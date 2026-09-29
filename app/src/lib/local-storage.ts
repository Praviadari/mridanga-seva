// Small key-value store on this device: keeps the login session and the chosen language
// between app launches.
//
// On Android and iOS, expo-sqlite provides the browser-style `localStorage` (the Expo guide for
// Supabase recommends it). On the web the browser's own localStorage is used and the import
// below does nothing. See https://docs.expo.dev/guides/using-supabase/
import 'expo-sqlite/localStorage/install';

/**
 * Reads a saved value. Returns null if it was never saved or storage is unavailable
 * (for example a private browser window that blocks storage).
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Saves a value on this device. Fails silently: losing a preference is not worth a crash. */
export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full; the app still works, it just forgets the value.
  }
}

/** Deletes a saved value from this device, if it is there. Fails silently, like writeLocal. */
export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked; there is nothing we could delete anyway.
  }
}
