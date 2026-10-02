// Sets up interface translations (English, Telugu, Hindi) and remembers the chosen language.
// All text shown to users lives in ./locales/*.json; screens get it with
// `const { t } = useTranslation()` from react-i18next. See docs/TRANSLATIONS.md and
// docs/DECISIONS.md #12.

import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { readLocal, writeLocal } from '@/lib/local-storage';

import en from './locales/en.json';
import hiJson from './locales/hi.json';
import teJson from './locales/te.json';

// Typing Telugu and Hindi as `typeof en` makes `npx tsc --noEmit` fail when either file is
// missing a key that English has, so no screen shows a raw key name.
const te: typeof en = teJson;
const hi: typeof en = hiJson;

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

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'te' || value === 'hi';
}

/**
 * True when the person picked a language on this device. That choice then wins over the one
 * saved on their profile (see syncLanguageWithProfile in src/auth/auth-provider.tsx).
 */
export function hasChosenLanguage(): boolean {
  return isLanguage(readLocal(STORAGE_KEY));
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
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    te: { translation: te },
    hi: { translation: hi },
  },
  lng: startLanguage(),
  fallbackLng: 'en',
  // React already escapes text, so i18next must not do it a second time.
  interpolation: { escapeValue: false },
  // The translations are bundled with the app, so they can load at once, before the first screen.
  initAsync: false,
  react: { useSuspense: false },
});

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
  void i18n.changeLanguage(language);
}

/**
 * Switches to the language saved on the person's profile, without marking it as a choice made
 * on this device.
 */
export function applyProfileLanguage(language: string): void {
  if (isLanguage(language) && language !== currentLanguage()) {
    void i18n.changeLanguage(language);
  }
}

export default i18n;
