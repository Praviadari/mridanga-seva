// Stand-in for src/i18n in the unit tests: only the app's language, set by a test through
// globalThis.__testLanguage ('en' until set).

/** The app's language code for the test that is running. */
export function currentLanguage() {
  return globalThis.__testLanguage ?? 'en';
}
