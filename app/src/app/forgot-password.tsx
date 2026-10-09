// A1 Forgot password: emails a link to set a new password. The link opens the web version of
// the app on the reset-password screen (src/app/reset-password.tsx).

import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isValidEmail, sendPasswordReset, type MessageKey } from '@/auth/auth-actions';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';

/** Asks for the email and sends the reset link. */
export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<MessageKey | null>(null);
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return; // Enter pressed again while the request runs (D6-17)
    setFieldError(isValidEmail(email) ? null : 'validation.emailInvalid');
    setFormError(null);
    if (!isValidEmail(email)) return;

    setBusy(true);
    const { errorKey } = await sendPasswordReset(email);
    setBusy(false);
    if (errorKey) setFormError(errorKey);
    else setSentTo(email.trim());
  }

  return (
    <Screen centred header={<BrandHeader compact />}>
      <Section title={t('forgotPassword.title')} description={sentTo ? undefined : t('forgotPassword.subtitle')}>
        {sentTo ? (
          <Notice tone="success">{t('forgotPassword.sent', { email: sentTo })}</Notice>
        ) : (
          <>
            {formError ? <Notice tone="error">{t(formError)}</Notice> : null}
            <TextField
              label={t('common.email')}
              value={email}
              onChangeText={setEmail}
              error={fieldError ? t(fieldError) : undefined}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="send"
              onSubmitEditing={submit}
            />
            <Button label={t('forgotPassword.submit')} onPress={submit} loading={busy} />
          </>
        )}
      </Section>

      <Button
        variant="link"
        label={t('forgotPassword.backToSignIn')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      />
    </Screen>
  );
}
