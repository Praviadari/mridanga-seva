// Shown for an address that matches no screen, e.g. an old or mistyped link on the web version.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';

/** "Page does not exist" with a button back to the start page. */
export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <Screen centred header={<BrandHeader compact />}>
      <AppText variant="subtitle">{t('notFound.title')}</AppText>
      <Button label={t('notFound.goHome')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
