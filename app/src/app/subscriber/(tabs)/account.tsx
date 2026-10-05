// My account for a public Ishtagoshti subscriber (Phase 2 slice 7, docs/DECISIONS.md #72): who is
// signed in, the app language, how to join the class, leaving Ishtagoshti (details, notes and ticks are
// deleted; asked twice) and signing out. Data: src/data/ig-subscribers.ts.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { signOut } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LanguagePicker } from '@/components/language-picker';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { leaveIshtagoshti } from '@/data/ig-subscribers';
import type { ParseKeys } from 'i18next';

/** The subscriber's account tab. */
export default function SubscriberAccountScreen() {
  const { t } = useTranslation();
  const { profile, session, refreshProfile } = useAuth();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ParseKeys | null>(null);

  async function leave() {
    setBusy(true);
    const problem = await leaveIshtagoshti();
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    // No subscription any more: the area goes back to the pending screen.
    await refreshProfile();
  }

  return (
    <Screen underHeader>
      <Section icon="profile" title={profile?.full_name || t('subscriberAccount.title')} description={session?.user.email ?? undefined}>
        <AppText tone="muted">{t('subscriberAccount.what')}</AppText>
        <LanguagePicker />
      </Section>

      <Section icon="students" title={t('subscriberAccount.classTitle')}>
        <AppText>{t('subscriberAccount.classBody')}</AppText>
      </Section>

      <Section icon="delete" title={t('subscriberAccount.leaveTitle')} description={t('subscriberAccount.leaveHint')}>
        {error ? <Notice tone="error">{t(error)}</Notice> : null}
        {asking ? (
          <>
            <Notice tone="error" title={t('subscriberAccount.leaveSure')}>{t('subscriberAccount.leaveSureBody')}</Notice>
            <Button icon="delete" label={t('subscriberAccount.leaveConfirm')} onPress={leave} loading={busy} />
            <Button variant="secondary" label={t('subscriberAccount.stay')} onPress={() => setAsking(false)} />
          </>
        ) : (
          <Button variant="secondary" icon="delete" label={t('subscriberAccount.leave')} onPress={() => setAsking(true)} />
        )}
      </Section>

      <Button variant="secondary" icon="signOut" label={t('common.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}
