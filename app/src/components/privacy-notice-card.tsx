// The privacy notice asked again after it changed (docs/DECISIONS.md #577), on the homes (S1, C1, G1): an adult reads
// it and agrees with a tick, a student who joined as a child and is 18 now gives their own consent the same way, and
// a child is asked to show it to the parent ("Done"). Nothing is blocked meanwhile; the card stays until answered.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { answerNotice, fetchNoticeAsk, type NoticeAsk } from '@/data/notice-card';
import { PRIVACY_NOTICE_VERSION } from '@/lib/privacy-notice';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Notice } from './notice';
import { PrivacyNoticeLink } from './privacy-notice-link';

/** The card, or nothing when there is nothing to ask (or the database cannot say). */
export function PrivacyNoticeCard() {
  const { t } = useTranslation();
  const [ask, setAsk] = useState<NoticeAsk | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [tickMissing, setTickMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchNoticeAsk().then((answer) => {
      if (live) setAsk(answer);
    });
    return () => {
      live = false;
    };
  }, []);

  if (ask === null) return null;

  async function send() {
    if (ask !== 'show' && !agreed) {
      setTickMissing(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    const ok = await answerNotice();
    setBusy(false);
    if (ok) setAsk(null);
    else setFailed(true);
  }

  return (
    <>
      <Notice tone="info" title={t(ask === 'adult_now' ? 'noticeCard.adultTitle' : 'noticeCard.title')}>
        {t(`noticeCard.${ask === 'adult_now' ? 'adultBody' : ask === 'show' ? 'showBody' : 'acceptBody'}`, {
          version: PRIVACY_NOTICE_VERSION,
        })}
      </Notice>
      <PrivacyNoticeLink label={t('noticeCard.read')} />
      {ask !== 'show' ? (
        <Checkbox
          label={t('noticeCard.agree')}
          checked={agreed}
          onChange={(on) => {
            setAgreed(on);
            if (on) setTickMissing(false);
          }}
          error={tickMissing ? t('noticeCard.tickFirst') : undefined}
        />
      ) : null}
      {failed ? <Notice tone="error">{t('noticeCard.saveFailed')}</Notice> : null}
      <Button
        variant="secondary"
        label={t(ask === 'show' ? 'noticeCard.done' : 'noticeCard.confirm')}
        loading={busy}
        onPress={() => void send()}
      />
    </>
  );
}
