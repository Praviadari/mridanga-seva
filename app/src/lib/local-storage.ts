// Small key-value store on this device: keeps the login session and the chosen language
// between app launches.
//
// On Android and iOS, expo-sqlite provides the browser-style `localStorage` (the Expo guide for
// Supabase recommends it). On the web the browser's own localStorage is used and the import
// below does nothing. See https://docs.expo.dev/guides/using-supabase/
import 'expo-sqlite/localStorage/install';

// Stands in for localStorage when the browser blocks it (D6-18): values then last until the page closes.
const memory = new Map<string, string>();

/**
 * Reads a saved value. Returns null if it was never saved or storage is unavailable
 * (for example a private browser window that blocks storage).
 */
export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Saves a value on this device. Fails silently: losing a preference is not worth a crash. */
export function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked or full; the app still works, it just forgets the value when the page closes.
    memory.set(key, value);
  }
}

/** Deletes a saved value from this device, if it is there. Fails silently, like writeLocal. */
export function removeLocal(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked; only the stand-in copy can be there.
  }
  memory.delete(key);
}

/**
 * The store handed to the Supabase client for the login. Never throws, so a browser that blocks
 * site storage still opens the app (the login then lasts until the page closes) instead of an
 * empty page (D6-18).
 */
export const deviceStorage = { getItem: readLocal, setItem: writeLocal, removeItem: removeLocal };
