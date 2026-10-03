// What a coordinator sees on a screen that only the Guru uses (G2, G3, G10, G11): one line that
// says so, with the screen's title. The staff/ folder is open to both roles (docs/ARCHITECTURE.md
// "Navigation by role"); the database refuses a coordinator's reads and changes there anyway.

import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Notice } from './notice';
import { Screen } from './screen';

/** A screen saying that only the facilitator uses this page. */
export function GuruOnly({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Screen underHeader centred>
      <Stack.Screen options={{ title }} />
      <Notice tone="info">{t('admin.guruOnly')}</Notice>
    </Screen>
  );
}
