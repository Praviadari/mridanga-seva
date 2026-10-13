// A quiet notice when push notifications do not work on this phone (audit R5-04, docs/DECISIONS.md #305):
// the person refused them (with "Turn on in Settings" and, on a home, "Not now"), or the registration failed
// (the app tries again when it comes back to the front, src/app/_layout.tsx PushSetup). Shown on the homes
// and My profile. Android app only: the web version never sets the state (src/lib/push-state.ts).

import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { hideDeniedNoticeOnHome, usePushNotice } from '@/lib/push-state';

import { Button } from './button';
import { Notice } from './notice';

/** The notice for a home or My profile; nothing while push works or was never tried. */
export function PushNotice({ place }: { place: 'home' | 'profile' }) {
  const { t } = useTranslation();
  const notice = usePushNotice(place);
  if (notice === null) return null;

  if (notice === 'failed') {
    return (
      <Notice tone="info" title={t('push.failedTitle')}>
        {t('push.failedBody')}
      </Notice>
    );
  }
  return (
    <>
      <Notice tone="info" title={t('push.offTitle')}>
        {t('push.offBody')}
      </Notice>
      <Button variant="secondary" icon="open" label={t('push.openSettings')} onPress={() => void Linking.openSettings()} />
      {place === 'home' ? <Button variant="link" label={t('push.notNow')} onPress={hideDeniedNoticeOnHome} /> : null}
    </>
  );
}
