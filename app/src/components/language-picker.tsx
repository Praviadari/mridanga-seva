// Three buttons to switch the app between English, Telugu and Hindi. Shown on the sign-in
// screens so a person can read them in their own language before they have an account, and on
// the three home screens (S1, C1, G1) so a signed-in person can switch without signing out.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { saveProfileLanguage, useAuth } from '@/auth/auth-provider';
import { chooseLanguage, currentLanguage, LANGUAGES, type Language } from '@/i18n';

import { ChoiceGroup } from './choice-group';

/**
 * Language switch. The choice is saved on this device at once; when someone is signed in it is
 * also saved to their profile at once, otherwise when they sign in (src/auth/auth-provider.tsx).
 */
export function LanguagePicker() {
  // Subscribing to translations re-renders the picker when the language changes.
  useTranslation();
  const { profile } = useAuth();

  function choose(language: Language) {
    chooseLanguage(language);
    if (profile) saveProfileLanguage(profile, language);
  }

  return (
    <View style={styles.centre}>
      <ChoiceGroup<Language>
        choices={LANGUAGES.map(({ code, nativeName }) => ({ value: code, label: nativeName }))}
        value={currentLanguage()}
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
