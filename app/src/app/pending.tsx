// Waiting room for people who are signed in but cannot use the app yet: a new account with no
// role, an account the Guru switched off, a door-tablet login (Phase 2), or a profile that
// could not be loaded. Explains which case it is and lets them check again.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';

/** Pending-access screen with "Check again" and "Sign out". */
export default function PendingScreen() {
  const { t } = useTranslation();
  const { session, profile, profileFailed, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  async function checkAgain() {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  }

  let message;
  if (profileFailed || !profile) {
    message = <Notice tone="error" title={t('pending.loadFailedTitle')}>{t('common.networkError')}</Notice>;
  } else if (!profile.active) {
    message = <Notice tone="error" title={t('pending.inactiveTitle')}>{t('pending.inactiveBody')}</Notice>;
  } else if (profile.role === 'kiosk') {
    message = <AppText>{t('pending.kiosk')}</AppText>;
  } else {
    message = (
      <>
        <AppText>{t('pending.body')}</AppText>
        <AppText tone="muted">{t('pending.studentHint')}</AppText>
      </>
    );
  }

  return (
    <Screen centred header={<BrandHeader compact />}>
      <AppText variant="title">{t('pending.title')}</AppText>
      {message}
      {session?.user.email ? (
        <AppText variant="small" tone="muted">
          {t('pending.signedInAs', { email: session.user.email })}
        </AppText>
      ) : null}
      <Button label={t('pending.checkAgain')} onPress={checkAgain} loading={checking} />
      <Button variant="secondary" label={t('common.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
