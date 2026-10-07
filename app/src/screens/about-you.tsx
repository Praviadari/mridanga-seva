// About you (step 2 of joining, team MoM 05-10-2026, docs/DECISIONS.md #164): right after the first
// sign-in, for a login waiting for the desk or a student, in four short steps that are each saved
// when the person moves on ("saved as you go"): phone (and gender when the desk has none), emergency
// contact, how they heard of the class, occupation and service areas. "Skip for now" leaves; the
// form does not open by itself again and stays reachable from the waiting screen and My profile.
// Routes: app/about-you.tsx (waiting login), app/student/about-you.tsx.

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { EmergencyPart, HeardPart, OccupationPart, YouPart } from '@/components/about-fields';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import {
  aboutFormFrom,
  aboutPatch,
  checkAbout,
  fetchMyAbout,
  saveAboutMe,
  type AboutContext,
  type AboutErrors,
  type AboutForm,
  type AboutMe,
  type AboutPart,
} from '@/data/about';
import { goBackOr } from '@/lib/go-back';

/** Props for AboutYouScreen. */
export type AboutYouScreenProps = {
  /** Where "Skip" and "Done" lead when there is no screen to go back to. */
  home: '/pending' | '/student';
  /** True on the waiting screen's stack (own header), false inside the student's stack (title bar). */
  standalone: boolean;
};

const STEPS: readonly AboutPart[] = ['you', 'emergency', 'heard', 'occupation'];

/** About you, one step at a time. */
export function AboutYouScreen({ home, standalone }: AboutYouScreenProps) {
  const { t } = useTranslation();
  // undefined = loading, null = failed, 'missing' = the database has no 0036 yet.
  const [about, setAbout] = useState<AboutMe | 'missing' | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<AboutForm | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<AboutErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyAbout().then((result) => {
      if (cancelled) return;
      setAbout(result);
      if (result && result !== 'missing') setForm(aboutFormFrom(result, result.countryCode));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const leave = () => goBackOr(home);
  const title = <Stack.Screen options={{ title: t('about.title') }} />;
  const wrap = (children: React.ReactNode) =>
    standalone ? (
      <Screen centred header={<BrandHeader compact />}>
        <AppText variant="title">{t('about.title')}</AppText>
        {children}
      </Screen>
    ) : (
      <Screen underHeader>
        {title}
        {children}
      </Screen>
    );

  if (about === undefined) return wrap(<AppText tone="muted">{t('common.loading')}</AppText>);
  if (about === null || about === 'missing' || !form) {
    return wrap(
      <>
        <Notice tone="error" title={t('about.loadFailed')}>
          {about === 'missing' ? t('about.notReady') : t('common.networkError')}
        </Notice>
        {about === null ? <Button icon="refresh" label={t('common.tryAgain')} onPress={() => setAttempt(attempt + 1)} /> : null}
        <Button variant="secondary" label={t('about.back')} onPress={leave} />
      </>,
    );
  }

  const context: AboutContext = { minor: about.minor, hasGuardian: about.hasGuardian, staff: false };
  const part = STEPS[step];
  const last = step === STEPS.length - 1;
  const set = <K extends keyof AboutForm>(key: K, value: AboutForm[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  /** Saves this step's answers (and, at the end, "done"), then moves on. */
  async function saveStep() {
    if (!form || typeof about !== 'object' || !about) return;
    const found = checkAbout(form, [part], context);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError(t('about.errors.fixFields'));
      return;
    }
    setFormError(null);
    setBusy(true);
    const patch = aboutPatch(form, [part], context);
    // A referral already given and not retyped stays as it is.
    if (part === 'heard' && form.heardVia === 'referral' && !form.referralCode.trim() && about.referred) delete patch.heard_via;
    const result = await saveAboutMe(last ? { ...patch, about_state: 'done' } : patch);
    setBusy(false);
    if (result.errorKey) {
      setFormError(t(result.errorKey));
      return;
    }
    if (result.about) setAbout(result.about);
    if (last) {
      leave();
      return;
    }
    setStep(step + 1);
  }

  async function skip() {
    setBusy(true);
    await saveAboutMe({ about_state: 'skipped' });
    setBusy(false);
    leave();
  }

  const partProps = { form, set, errors, options: about.options, context };
  const stepTitles: Record<AboutPart, string> = {
    you: t('about.stepYou'),
    emergency: t('about.stepEmergency'),
    heard: t('about.stepHeard'),
    occupation: t('about.stepOccupation'),
  };

  return wrap(
    <>
      <AppText tone="muted">{t('about.intro')}</AppText>
      <ProgressBar done={step} total={STEPS.length} label={t('about.progress')} showComplete={false}
        valueText={t('about.stepOf', { step: step + 1, total: STEPS.length })} />
      <Section icon="about" title={stepTitles[part]}>
        {part === 'you' ? <YouPart {...partProps} /> : null}
        {part === 'emergency' && about.minor && about.hasGuardian ? (
          <AppText>{t('about.guardianOnRecord')}</AppText>
        ) : part === 'emergency' ? (
          <EmergencyPart {...partProps} />
        ) : null}
        {part === 'heard' && about.referred && form.heardVia === 'referral' ? (
          <AppText variant="small" tone="success">{t('about.codeSaved')}</AppText>
        ) : null}
        {part === 'heard' ? <HeardPart {...partProps} /> : null}
        {part === 'occupation' ? <OccupationPart {...partProps} /> : null}
      </Section>
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <Button icon={last ? 'check' : 'chevron'} label={last ? t('about.finish') : t('about.saveNext')} onPress={saveStep} loading={busy} />
      {step > 0 ? <Button variant="secondary" label={t('about.previous')} onPress={() => setStep(step - 1)} /> : null}
      <Button variant="link" label={t('about.skip')} onPress={skip} disabled={busy} />
      <AppText variant="small" tone="muted">{t('about.optionalNote')}</AppText>
    </>,
  );
}
