// A1 Forgot password: emails a link to set a new password. The link opens the web version of
// the app on the reset-password screen (src/app/reset-password.tsx).

import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isValidEmail, sendPasswordReset, type MessageKey } from '@/auth/auth-actions';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
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
    <Screen centred>
      <AppText variant="title">{t('forgotPassword.title')}</AppText>

      {sentTo ? (
        <Notice tone="success">{t('forgotPassword.sent', { email: sentTo })}</Notice>
      ) : (
        <>
          <AppText tone="muted">{t('forgotPassword.subtitle')}</AppText>
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

      <Button
        variant="link"
        label={t('forgotPassword.backToSignIn')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      />
    </Screen>
  );
}
