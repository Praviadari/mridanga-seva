// Said where parents' details, consents or call notes were held back because the Guru asks for sign-in codes and
// this session did not give one (migration 0061, docs/DECISIONS.md #583): why, and the way to My sign-in code.

import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from './button';
import { Notice } from './notice';

/** "Private details need your sign-in code", with a button to set it up. */
export function PrivateHiddenNotice() {
  const { t } = useTranslation();
  return (
    <>
      <Notice tone="info" title={t('myCode.hiddenTitle')}>
        {t('myCode.hiddenBody')}
      </Notice>
      <Button variant="secondary" icon="settings" label={t('myCode.open')} onPress={() => router.push('/staff/my-sign-in-code')} />
    </>
  );
}
