// Sets up interface translations (English, Telugu, Hindi) and remembers the chosen language.
// All text shown to users lives in ./locales/*.json; screens get it with
// `const { t } = useTranslation()` from react-i18next. See docs/TRANSLATIONS.md and
// docs/DECISIONS.md #12.
//
// English is always in (it is the fallback for a missing text). Telugu and Hindi are loaded only when they are
// the start language or chosen (./locale-loaders.ts on the phone, at once; ./locale-loaders.web.ts on the web,
// a separate download, while the app's splash stays up: useLanguageReady) (audit P4-06 / D9-11, #331).

import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { useSyncExternalStore } from 'react';
import { initReactI18next } from 'react-i18next';

import { readLocal, removeLocal, writeLocal } from '@/lib/local-storage';

import { loadLocale, type Translations } from './locale-loaders';
import en from './locales/en.json';

/** Language codes the app supports. Same list as the `profiles.language` check in the database. */
export type Language = 'en' | 'te' | 'hi';

/**
 * Languages offered in the language picker. Each name is written in its own script (not
 * translated), so a person can find their language whatever the app is showing now.
 */
export const LANGUAGES: readonly { code: Language; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'te', nativeName: 'తెలుగు' },
  { code: 'hi', nativeName: 'हिन्दी' },
];

const STORAGE_KEY = 'language';
// Set while a language picked on this device has not reached the person's profile yet (picked
// before signing in, or saved without internet). Round 8 (docs/DECISIONS.md #48): before, any
// language ever picked on a device won over the profile at every start, so two devices of one
// person kept overwriting each other's choice and a choice seemed lost after a reload.
const UNSAVED_KEY = 'languageUnsaved';

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'te' || value === 'hi';
}

/**
 * True when the person picked a language on this device that is not on their profile yet. That
 * choice then goes to the profile (see syncLanguageWithProfile in src/auth/auth-provider.tsx);
 * otherwise the profile's language is used.
 */
export function hasUnsavedChoice(): boolean {
  return readLocal(UNSAVED_KEY) === '1' && isLanguage(readLocal(STORAGE_KEY));
}

/** Notes that the language on this device is now the one saved on the profile. */
export function markLanguageSaved(): void {
  removeLocal(UNSAVED_KEY);
}

/** The language to start in: this device's saved choice, else the phone's language, else English. */
function startLanguage(): Language {
  const saved = readLocal(STORAGE_KEY);
  if (isLanguage(saved)) return saved;
  const device = getLocales()[0]?.languageCode;
  return isLanguage(device) ? device : 'en';
}

// Our own instance (not i18next's global default), handed to react-i18next by initReactI18next.
const i18n = createInstance();
const start = startLanguage();
// The start language's texts, when they are at hand already (always on the phone; never on the web).
const startTexts = start === 'en' ? null : loadLocale(start);
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ...(startTexts && !(startTexts instanceof Promise) ? { [start]: { translation: startTexts } } : {}),
  },
  lng: start,
  fallbackLng: 'en',
  // React already escapes text, so i18next must not do it a second time.
  interpolation: { escapeValue: false },
  // The translations are bundled with the app, so they can load at once, before the first screen.
  initAsync: false,
  react: { useSuspense: false },
});

// ---------------------------------------------------------------- loading Telugu and Hindi when needed

/** Languages being downloaded (web only); the app shows its splash meanwhile. */
const loading = new Set<Language>();
const readyListeners = new Set<() => void>();
function setLoading(language: Language, on: boolean): void {
  if (on) loading.add(language);
  else loading.delete(language);
  readyListeners.forEach((listener) => listener());
}

/**
 * Makes sure the texts of `language` are in. On the phone this happens at once and `then` runs before it
 * returns; on the web the file is downloaded first (a failed download leaves the app in English, the
 * fallback, and the next choice tries again).
 */
function withLanguage(language: Language, then: () => void): void {
  if (language === 'en' || i18n.hasResourceBundle(language, 'translation')) {
    then();
    return;
  }
  const add = (texts: Translations) => {
    i18n.addResourceBundle(language, 'translation', texts);
    then();
  };
  const texts = loadLocale(language);
  if (!(texts instanceof Promise)) {
    add(texts);
    return;
  }
  setLoading(language, true);
  texts.then(add, () => undefined).finally(() => setLoading(language, false));
}

// The web: the start language downloads now; switching to it once it is in draws the app in it.
if (startTexts instanceof Promise) withLanguage(start, () => void i18n.changeLanguage(start));

/**
 * False while the start language is still downloading (the web only), so the root layout keeps the app's
 * splash up instead of showing the app in English for a moment.
 */
export function useLanguageReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      readyListeners.add(listener);
      return () => readyListeners.delete(listener);
    },
    () => !loading.has(start),
  );
}

/**
 * On the web, the page's language follows the app's (<html lang>), so screen readers such as
 * VoiceOver on an iPhone read Telugu and Hindi with a Telugu or Hindi voice, not an English one.
 * Phones have no page; there React Native passes the text to the reader as it is.
 */
function setPageLanguage(language: string): void {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}
setPageLanguage(i18n.language);
i18n.on('languageChanged', setPageLanguage);

/** The language the app is showing now. */
export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

/**
 * Switches the app to `language` because the person chose it, and remembers the choice on this
 * device. The caller should also save it to the person's profile when they are signed in.
 */
export function chooseLanguage(language: Language): void {
  writeLocal(STORAGE_KEY, language);
  writeLocal(UNSAVED_KEY, '1');
  withLanguage(language, () => void i18n.changeLanguage(language));
}

/**
 * Shows `language` for this visit only, without remembering it: a parent's page opened with ?lang= (the consent page,
 * the parent page). On the web the language is downloaded first, as for a choice (#331); a bare changeLanguage would
 * keep English.
 */
export function showLanguage(language: Language): void {
  if (language !== currentLanguage()) withLanguage(language, () => void i18n.changeLanguage(language));
}

/**
 * Switches to the language saved on the person's profile and remembers it on this device, so
 * the next start (and the sign-in screen after a sign-out) opens in it.
 */
export function applyProfileLanguage(language: string): void {
  if (!isLanguage(language)) return;
  writeLocal(STORAGE_KEY, language);
  if (language !== currentLanguage()) withLanguage(language, () => void i18n.changeLanguage(language));
}

export default i18n;
