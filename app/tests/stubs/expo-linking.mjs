// Stand-in for expo-linking in the unit tests: the link the app was opened with, set by a test
// through globalThis.__testInitialUrl (null when opened from the home-screen icon).

/** The URL that opened the app, or null. */
export async function getInitialURL() {
  return globalThis.__testInitialUrl ?? null;
}
