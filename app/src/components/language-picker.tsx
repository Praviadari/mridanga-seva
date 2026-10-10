// Three buttons to switch the app between English, Telugu and Hindi. Shown on the sign-in
// screens so a person can read them in their own language before they have an account, and on
// the three home screens (S1, C1, G1) so a signed-in person can switch without signing out.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { chooseLanguage, LANGUAGES, type Language } from '@/i18n';

import { ChoiceGroup } from './choice-group';

/**
 * Language switch. The choice is saved on this device at once; when someone is signed in it is
 * also saved to their profile at once, otherwise when they sign in (src/auth/auth-provider.tsx).
 */
export function LanguagePicker() {
  // Subscribing to translations re-renders the picker when the language changes. The choice shown
  // is read from the hook's i18n.language, not currentLanguage(): the React Compiler kept the
  // plain call's first answer, so the picker stayed on the start language (found 09-10-2026).
  const { t, i18n } = useTranslation();
  const shown = LANGUAGES.find(({ code }) => code === i18n.language)?.code ?? 'en';
  const { profile, saveLanguage } = useAuth();

  function choose(language: Language) {
    chooseLanguage(language);
    if (profile) saveLanguage(language);
  }

  return (
    <View style={styles.centre}>
      <ChoiceGroup<Language>
        // No label on screen (the footer writes "Language" beside it); screen readers still hear it.
        accessibilityLabel={t('common.language')}
        choices={LANGUAGES.map(({ code, nativeName }) => ({ value: code, label: nativeName, lang: code }))}
        value={shown}
        onChange={choose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    alignItems: 'center',
  },
});
