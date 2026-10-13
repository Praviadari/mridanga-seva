// Telugu and Hindi on the phone (audit phase 4 P4-06, docs/DECISIONS.md #331): read when first needed, not at
// every start. A require() inside a function makes Metro evaluate the file only when it is called, so a
// person who uses English never holds the 6,000 Telugu and Hindi strings in memory; the language of the start
// is still loaded at once, before the first screen. The web has its own file (locale-loaders.web.ts) that
// downloads them as separate files.

import type en from './locales/en.json';
import type hiJson from './locales/hi.json';
import type teJson from './locales/te.json';

/** The shape of one language's file: English's. */
export type Translations = typeof en;

/**
 * The texts of Telugu or Hindi. Returning them as Translations makes `npx tsc --noEmit` fail when either file
 * misses a key English has, so no screen shows a raw key name.
 */
export function loadLocale(language: 'te' | 'hi'): Translations | Promise<Translations> {
  if (language === 'te') {
    const te: typeof teJson = require('./locales/te.json');
    return te;
  }
  const hi: typeof hiJson = require('./locales/hi.json');
  return hi;
}
