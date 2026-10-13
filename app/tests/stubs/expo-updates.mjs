// Stand-in for expo-updates in the unit tests (src/lib/slow-start.ts restartApp): counts reloadAsync calls,
// and a test can make it fail through globalThis.__reloadFails.

export const updates = { reloads: 0 };

export async function reloadAsync() {
  updates.reloads += 1;
  if (globalThis.__reloadFails) throw new Error('reload failed');
}
