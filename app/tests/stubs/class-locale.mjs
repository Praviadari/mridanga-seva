// Stand-in for src/lib/class-locale.ts in the unit tests: the class's time zone and country, set by
// a test through globalThis.__testClassLocale (India, as in the app, until a test sets one).

export const DEFAULT_CLASS_LOCALE = { timeZone: 'Asia/Kolkata', country: 'IN' };

/** The class's zone and country for the test that is running. */
export function classLocale() {
  return globalThis.__testClassLocale ?? DEFAULT_CLASS_LOCALE;
}
