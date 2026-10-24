// My profile → Notifications on this browser (web version only; migration 0062, docs/DECISIONS.md #603): the one place
// where a student or staff member switches web push on, by a tap; nothing is asked when the app loads. On an iPhone
// outside the home-screen app it explains Add to Home Screen instead of offering it. Nothing in the Android app (it
// has its own push) or on a site without web push set up.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { turnOffWebPush, turnOnWebPush, webPushHere, webPushState, type WebPushState } from '@/lib/web-push';

import { AppText } from './app-text';
import { Button } from './button';
import { Notice } from './notice';
import { PrivacyNoticeLink } from './privacy-notice-link';
import { Section } from './section';

/** The section, or nothing where web push cannot be offered. */
export function WebPushSection() {
  const { t } = useTranslation();
  const place = webPushHere();
  // undefined while reading the browser's state.
  const [state, setState] = useState<WebPushState | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (place !== 'ready') return;
    let cancelled = false;
    void webPushState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [place]);

  if (place === 'native' || place === 'not-set-up') return null;

  // Called straight from the tap: Safari asks for the permission only there.
  function turnOn() {
    setBusy(true);
    setMessage(null);
    void turnOnWebPush().then((outcome) => {
      setBusy(false);
      if (outcome === 'on') {
        setState('on');
        setMessage({ tone: 'success', text: t('webPush.turnedOn') });
      } else if (outcome === 'blocked') {
        setState('blocked');
      } else {
        setMessage({ tone: 'error', text: t('webPush.failed') });
      }
    });
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    await turnOffWebPush();
    setBusy(false);
    setState('off');
    setMessage({ tone: 'success', text: t('webPush.turnedOff') });
  }

  return (
    <Section icon="bell" title={t('webPush.title')} description={t('webPush.hint')}>
      {place === 'iphone-add-to-home' ? (
        <Notice tone="info" title={t('webPush.iphoneTitle')}>
          {t('webPush.iphoneSteps')}
        </Notice>
      ) : null}
      {place === 'iphone-too-old' ? <Notice tone="info">{t('webPush.iphoneOld')}</Notice> : null}
      {place === 'unsupported' ? <Notice tone="info">{t('webPush.unsupported')}</Notice> : null}
      {place === 'ready' && state === 'blocked' ? (
        <Notice tone="info" title={t('webPush.blockedTitle')}>
          {t('webPush.blockedBody')}
        </Notice>
      ) : null}
      {place === 'ready' && state === 'on' ? <AppText tone="muted">{t('webPush.onLine')}</AppText> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {place === 'ready' && state === 'off' ? (
        <Button icon="bell" label={t('webPush.turnOn')} loading={busy} disabled={busy} onPress={turnOn} />
      ) : null}
      {place === 'ready' && state === 'on' ? (
        <Button variant="secondary" icon="bell" label={t('webPush.turnOff')} loading={busy} disabled={busy} onPress={() => void turnOff()} />
      ) : null}
      {place === 'ready' && state !== undefined ? (
        <>
          <AppText variant="small" tone="muted">
            {t('webPush.privacy')}
          </AppText>
          <PrivacyNoticeLink label={t('webPush.privacyLink')} />
        </>
      ) : null}
    </Section>
  );
}
