// The heading font: Cormorant Garamond SemiBold, the website's headings (docs/DECISIONS.md #337). Loaded at run
// time with expo-font from the app's own file, so it reaches installed phones with an update, not a new APK.
// English only: the serif has no Telugu or Devanagari letters, so te/hi headings stay in the phone's bold sans,
// as on the website. Until the file is loaded (a few milliseconds) or if it fails, headings use the sans.

import { useFonts } from 'expo-font';
import { createContext, useContext, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { serifFont } from './tokens.generated';

const SerifLoaded = createContext(false);

/** Loads the heading font for everything inside it (the root layout). Never waits for it. */
export function HeadingFontProvider({ children }: PropsWithChildren) {
  const [loaded] = useFonts({ [serifFont]: require('../../assets/fonts/CormorantGaramond-SemiBold.ttf') });
  return <SerifLoaded.Provider value={loaded}>{children}</SerifLoaded.Provider>;
}

/** The heading font's family for the current language, or undefined for the sans (te, hi, not loaded). */
export function useHeadingFont(): string | undefined {
  const loaded = useContext(SerifLoaded);
  const { i18n } = useTranslation();
  return loaded && (i18n.resolvedLanguage ?? i18n.language ?? '').startsWith('en') ? serifFont : undefined;
}
