// Waiting room for people who are signed in but cannot use the app yet: a new account with no
// role, an account the Guru switched off, a door-tablet login (Phase 2), or a profile that
// could not be loaded. Explains which case it is and lets them check again. A login without a class
// role may also join Ishtagoshti for free here (I14, docs/DECISIONS.md #88), or finish joining.

import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { SignOutButton } from '@/components/sign-out-button';
import { Section } from '@/components/section';
import { useAboutPrompt } from '@/lib/about-prompt';

/** Pending-access screen with "Check again" and "Sign out". */
export default function PendingScreen() {
  const { t } = useTranslation();
  const { session, profile, profileProblem, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);
  // Step 2 of joining (docs/DECISIONS.md #164): opens by itself once; the card below opens it later.
  const waitingForDesk = !!profile?.active && profile.role === 'pending' && profile.ig_state !== 'active' && profile.ig_state !== 'blocked';
  const aboutOpen = useAboutPrompt(profile?.id, '/about-you', waitingForDesk);

  async function checkAgain() {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  }

  let message;
  if (!profile) {
    // Word each cause apart (D6-06): only a network failure is about the internet.
    const body =
      profileProblem === 'network' ? t('common.networkError') : profileProblem === 'server' ? t('pending.serverError') : t('pending.missingProfile');
    message = <Notice tone="error" title={t('pending.loadFailedTitle')}>{body}</Notice>;
  } else if (!profile.active) {
    message = <Notice tone="error" title={t('pending.inactiveTitle')}>{t('pending.inactiveBody')}</Notice>;
  } else if (profile.role === 'kiosk') {
    message = <AppText>{t('pending.kiosk')}</AppText>;
  } else if (profile.ig_state === 'blocked') {
    message = <Notice tone="error" title={t('ishtagoshtiJoin.blockedTitle')}>{t('ishtagoshtiJoin.blockedBody')}</Notice>;
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
      {waitingForDesk && aboutOpen !== null ? (
        <Section icon="about" title={t('about.cardTitle')} description={aboutOpen ? t('about.cardBody') : t('about.cardDone')}>
          <Button
            icon="about"
            variant={aboutOpen ? 'primary' : 'secondary'}
            label={aboutOpen ? t('about.cardOpen') : t('about.cardEdit')}
            onPress={() => router.push('/about-you')}
          />
        </Section>
      ) : null}
      {profile?.active && profile.role === 'pending' && (profile.ig_state === 'none' || profile.ig_state === 'awaiting_parent') ? (
        <Section icon="ishtagoshti" title={t('pending.igTitle')} description={t('pending.igHint')}>
          <Button
            icon="ishtagoshti"
            label={profile.ig_state === 'awaiting_parent' ? t('pending.igParentCode') : t('pending.igJoin')}
            onPress={() => router.push('/join-ishtagoshti')}
          />
        </Section>
      ) : null}
      {session?.user.email ? (
        <AppText variant="small" tone="muted">
          {t('pending.signedInAs', { email: session.user.email })}
        </AppText>
      ) : null}
      <Button label={t('pending.checkAgain')} onPress={checkAgain} loading={checking} />
      <SignOutButton />
    </Screen>
  );
}
