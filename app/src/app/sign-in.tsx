// A1 Login: sign in with email and password. Everyone uses this screen; the database decides
// the role afterwards (docs/DECISIONS.md #7, #11). Links to create an account and to reset a
// forgotten password. Opened from an email link that expired or was used already, it says so and
// offers a new confirmation email or a new password link (src/auth/email-link.ts, D6-12). After a
// sign-out the person did not ask for, it says they were signed out (src/auth/session-end.ts, D6-20).

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInput } from 'react-native';

import { isValidEmail, resendConfirmation, signIn, type MessageKey } from '@/auth/auth-actions';
import { clearEmailLinkProblem, emailLinkProblem } from '@/auth/email-link';
import { clearSessionEnded, sessionEnded } from '@/auth/session-end';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { LanguagePicker } from '@/components/language-picker';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';

/** Sign-in form. On success the app moves to the person's screens by itself (_layout.tsx). */
export default function SignInScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: MessageKey; password?: MessageKey }>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  // Shown while this screen is open; forgotten at once, so it does not come back later.
  const [linkProblem] = useState(emailLinkProblem);
  useEffect(clearEmailLinkProblem, []);
  // Signed out by the server, not by the person (D6-20); also shown once.
  const [ended] = useState(sessionEnded);
  useEffect(clearSessionEnded, []);
  const [resentTo, setResentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  /** Sends a new confirmation email to the email typed above. */
  async function resend() {
    setFormError(null);
    if (!isValidEmail(email)) {
      setFieldErrors({ email: 'validation.emailInvalid' });
      emailRef.current?.focus();
      return;
    }
    setFieldErrors({});
    setResending(true);
    const { errorKey } = await resendConfirmation(email);
    setResending(false);
    if (errorKey) setFormError(errorKey);
    else setResentTo(email.trim());
  }

  async function submit() {
    if (busy) return; // Enter pressed again while the request runs (D6-17)
    const errors = {
      email: isValidEmail(email) ? undefined : ('validation.emailInvalid' as const),
      password: password ? undefined : ('validation.passwordRequired' as const),
    };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setBusy(true);
    const { errorKey } = await signIn(email, password);
    setBusy(false);
    if (errorKey) setFormError(errorKey);
  }

  return (
    // Centred: on a laptop the card sits in the middle of the page instead of hugging the band.
    <Screen centred header={<BrandHeader />}>
      <LanguagePicker />

      {linkProblem ? (
        <Section title={t(linkProblem === 'expired' ? 'signIn.linkExpiredTitle' : 'signIn.linkFailedTitle')}>
          <Notice tone="error">{t('signIn.linkBody')}</Notice>
          {resentTo ? <Notice tone="success">{t('signIn.resent', { email: resentTo })}</Notice> : null}
          <Button
            variant="secondary"
            icon="send"
            label={t('signIn.resendConfirmation')}
            onPress={resend}
            loading={resending}
          />
          <Button
            variant="secondary"
            icon="link"
            label={t('signIn.newPasswordLink')}
            onPress={() => router.push('/forgot-password')}
          />
        </Section>
      ) : null}

      <Section title={t('signIn.title')} description={t('signIn.subtitle')}>
        {ended ? <Notice tone="info" title={t('signIn.endedTitle')}>{t('signIn.endedBody')}</Notice> : null}
        {formError ? <Notice tone="error">{t(formError)}</Notice> : null}

        <TextField
          ref={emailRef}
          label={t('common.email')}
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email && t(fieldErrors.email)}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <TextField
          ref={passwordRef}
          label={t('common.password')}
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password && t(fieldErrors.password)}
          secret
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <Button label={t('signIn.submit')} onPress={submit} loading={busy} />
        <Button
          variant="link"
          label={t('signIn.forgotPassword')}
          onPress={() => router.push('/forgot-password')}
        />
      </Section>

      <AppText tone="muted" style={{ textAlign: 'center' }}>
        {t('signIn.noAccount')}
      </AppText>
      <Button
        variant="secondary"
        label={t('signIn.createAccount')}
        onPress={() => router.push('/sign-up')}
      />
    </Screen>
  );
}
