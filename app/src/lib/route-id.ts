// Which ids a screen's address may hold (D6-07), checked by components/route-id-guard.tsx before
// the screen loads anything. Pure, so the unit tests can check it (tests/app-correctness.test.mjs).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True when `value` is an id of this kind: a whole number from 1 up (the tables' bigint ids) or a
 * UUID (students and logins); with `allowNew`, also the word "new" that opens an empty form.
 */
export function isRouteId(value: string | undefined, kind: 'number' | 'uuid', allowNew = false): boolean {
  if (value === undefined) return false;
  if (allowNew && value === 'new') return true;
  if (kind === 'uuid') return UUID.test(value);
  return /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
}
