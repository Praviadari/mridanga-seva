// Waiting room for people who are signed in but cannot use the app yet: a new account with no
// role, an account the Guru switched off, a door-tablet login (Phase 2), or a profile that
// could not be loaded. Explains which case it is and lets them check again. A login without a class
// role may also join Ishtagoshti for free here (I14, docs/DECISIONS.md #88) once its real terms are in (off until then:
// lib/ishtagoshti-terms.ts, audit S4-08), or finish a join already started.
// A new student waiting for the class desk sees "Almost there" and the three steps of joining (account made, come to
// the desk with an ID, your QR card), and the screen checks by itself every 30 s (#380, 15-10-2026).
// A child who signed up at home (migration 0051, #399) sees one more step, the parent's consent by email, with a card that
// says where it stands (src/components/parent-consent-card.tsx); About you waits (nothing beyond the sign-up before the
// parent consents) and is not offered to a child at all: the desk records what is needed.

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { JoinSteps } from '@/components/join-steps';
import { Notice } from '@/components/notice';
import { ParentConsentCard } from '@/components/parent-consent-card';
import { Screen } from '@/components/screen';
import { SignOutButton } from '@/components/sign-out-button';
import { UpdateNotice } from '@/components/update-notice';
import { Section } from '@/components/section';
import { useAboutPrompt } from '@/lib/about-prompt';
import { IG_JOIN_FOR_WAITING } from '@/lib/ishtagoshti-terms';

/** How often the waiting screen asks again by itself (#380): often enough to open the home soon after the desk. */
const AUTO_CHECK_MS = 30_000;

/** Pending-access screen with "Check again" and "Sign out". */
export default function PendingScreen() {
  const { t } = useTranslation();
  const { session, profile, profileProblem, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);
  // Step 2 of joining (docs/DECISIONS.md #164): opens by itself once; the card below opens it later.
  const waitingForDesk = !!profile?.active && profile.role === 'pending' && profile.ig_state !== 'active' && profile.ig_state !== 'blocked';
  // A child's sign-up at home (#399): the parent's consent comes first; About you is not offered.
  const minor = waitingForDesk ? profile?.minor_state : undefined;
  const aboutOpen = useAboutPrompt(profile?.id, '/about-you', waitingForDesk && !minor);

  async function checkAgain() {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  }

  // It checks by itself while waiting for the desk (#380): every 30 s and when the app comes back to the front, so
  // the home opens on its own once a coordinator has registered the student (src/app/_layout.tsx moves on).
  const refreshRef = useRef(refreshProfile);
  useEffect(() => {
    refreshRef.current = refreshProfile;
  });
  useEffect(() => {
    if (!waitingForDesk) return;
    const timer = setInterval(() => void refreshRef.current(), AUTO_CHECK_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshRef.current();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [waitingForDesk]);

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
  } else if (waitingForDesk) {
    message = (
      <>
        <JoinSteps email={session?.user.email} minor={minor} />
        {minor ? <ParentConsentCard childEmail={session?.user.email} onChanged={() => void refreshRef.current()} /> : null}
      </>
    );
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
      <AppText variant="title">{waitingForDesk ? t('pending.almostTitle') : t('pending.title')}</AppText>
      {/* A fixed version may be what this person waits for (FLOW-06). */}
      <UpdateNotice />
      {message}
      {waitingForDesk && !minor && aboutOpen !== null ? (
        <Section icon="about" title={t('about.cardTitle')} description={aboutOpen ? t('about.cardBody') : t('about.cardDone')}>
          <Button
            icon="about"
            variant={aboutOpen ? 'primary' : 'secondary'}
            label={aboutOpen ? t('about.cardOpen') : t('about.cardEdit')}
            onPress={() => router.push('/about-you')}
          />
        </Section>
      ) : null}
      {profile?.active && profile.role === 'pending' && ((IG_JOIN_FOR_WAITING && profile.ig_state === 'none') || profile.ig_state === 'awaiting_parent') ? (
        <Section icon="ishtagoshti" title={t('pending.igTitle')} description={t('pending.igHint')}>
          <Button
            icon="ishtagoshti"
            label={profile.ig_state === 'awaiting_parent' ? t('pending.igParentCode') : t('pending.igJoin')}
            onPress={() => router.push('/join-ishtagoshti')}
          />
        </Section>
      ) : null}
      {session?.user.email && !waitingForDesk ? (
        <AppText variant="small" tone="muted">
          {t('pending.signedInAs', { email: session.user.email })}
        </AppText>
      ) : null}
      {/* While waiting for the desk the screen checks by itself, so the button is the quieter one (#380). */}
      <Button
        variant={waitingForDesk ? 'secondary' : 'primary'}
        icon="refresh"
        label={t('pending.checkAgain')}
        onPress={checkAgain}
        loading={checking}
      />
      <SignOutButton />
    </Screen>
  );
}
