// Telugu and Hindi on the web (audit D9-11 / phase 4 P4-06, docs/DECISIONS.md #331): each is its own file,
// downloaded only when that language is chosen, instead of riding in the one script every visitor loads
// (~1 MB of it before). The phone has its own file (locale-loaders.ts).

import type en from './locales/en.json';
import type hiJson from './locales/hi.json';
import type teJson from './locales/te.json';

/** The shape of one language's file: English's. */
export type Translations = typeof en;

/**
 * The texts of Telugu or Hindi, downloaded. Returning them as Translations makes `npx tsc --noEmit` fail when
 * either file misses a key English has.
 */
export async function loadLocale(language: 'te' | 'hi'): Promise<Translations> {
  if (language === 'te') {
    const te: typeof teJson = (await import('./locales/te.json')).default;
    return te;
  }
  const hi: typeof hiJson = (await import('./locales/hi.json')).default;
  return hi;
}
