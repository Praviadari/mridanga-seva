// Three buttons to switch the app between English, Telugu and Hindi. Shown on the sign-in
// screens so a person can read them in their own language before they have an account.

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { chooseLanguage, currentLanguage, LANGUAGES, type Language } from '@/i18n';

import { ChoiceGroup } from './choice-group';

/**
 * Language switch. The choice is saved on this device at once and copied to the person's
 * profile when they sign in (src/auth/auth-provider.tsx).
 */
export function LanguagePicker() {
  // Subscribing to translations re-renders the picker when the language changes.
  useTranslation();
  return (
    <View style={styles.centre}>
      <ChoiceGroup<Language>
        choices={LANGUAGES.map(({ code, nativeName }) => ({ value: code, label: nativeName }))}
        value={currentLanguage()}
        onChange={chooseLanguage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centre: {
    alignItems: 'center',
  },
});
