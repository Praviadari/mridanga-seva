// The heading fonts, one per language: English = Cormorant Garamond SemiBold, the website's headings (docs/DECISIONS.md
// #337); Telugu = Noto Serif Telugu SemiBold and Hindi = Noto Serif Devanagari SemiBold (UI audit fix 8, #367), so the
// serif look reaches every language. Each is a subset of its letters (app/assets/fonts, OFL), loaded at run time with
// expo-font from the app's own file, so it reaches installed phones with an update, not a new APK. Only the current
// language's font is loaded (on the web only that file is fetched); until it is loaded (a few milliseconds) or if it
// fails, headings use the phone's bold sans.

import { isLoaded, loadAsync, type FontSource } from 'expo-font';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { serifFont } from './tokens.generated';

/** The languages with their own heading font. */
type HeadingLanguage = 'en' | 'te' | 'hi';

/** Each language's heading font: its family name (the key for `fontFamily`) and file. */
const HEADING_FONTS: Record<HeadingLanguage, { family: string; source: FontSource }> = {
  en: { family: serifFont, source: require('../../assets/fonts/CormorantGaramond-SemiBold.ttf') },
  te: { family: 'NotoSerifTelugu-SemiBold', source: require('../../assets/fonts/NotoSerifTelugu-SemiBold.ttf') },
  hi: { family: 'NotoSerifDevanagari-SemiBold', source: require('../../assets/fonts/NotoSerifDevanagari-SemiBold.ttf') },
};

/** The heading language of an i18n language code: 'te', 'hi', else English. */
function headingLanguage(code: string | undefined): HeadingLanguage {
  if (code?.startsWith('te')) return 'te';
  if (code?.startsWith('hi')) return 'hi';
  return 'en';
}

/** The families loaded so far. */
const LoadedFonts = createContext<ReadonlySet<string>>(new Set());

/** Loads the current language's heading font for everything inside it (the root layout). Never waits for it. */
export function HeadingFontProvider({ children }: PropsWithChildren) {
  const { i18n } = useTranslation();
  const language = headingLanguage(i18n.resolvedLanguage ?? i18n.language);
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(
    () => new Set(Object.values(HEADING_FONTS).filter((f) => isLoaded(f.family)).map((f) => f.family)),
  );
  useEffect(() => {
    const { family, source } = HEADING_FONTS[language];
    let current = true;
    loadAsync({ [family]: source })
      .then(() => {
        if (current) setLoaded((was) => (was.has(family) ? was : new Set(was).add(family)));
      })
      // Not loaded: the headings keep the sans.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [language]);
  return <LoadedFonts.Provider value={loaded}>{children}</LoadedFonts.Provider>;
}

/** The heading font's family for the current language, or undefined for the sans (not loaded yet, or failed). */
export function useHeadingFont(): string | undefined {
  const loaded = useContext(LoadedFonts);
  const { i18n } = useTranslation();
  const { family } = HEADING_FONTS[headingLanguage(i18n.resolvedLanguage ?? i18n.language)];
  return loaded.has(family) ? family : undefined;
}

/**
 * True for the English serif: its small letters are short, so its headings are set larger (tokens serifType, the bar's
 * 22 px). The Telugu and Hindi serifs keep the sans sizes, whose line heights already leave room for their marks.
 */
export function isLatinSerif(family: string | undefined): boolean {
  return family === serifFont;
}
