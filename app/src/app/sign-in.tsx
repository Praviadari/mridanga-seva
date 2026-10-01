// A1 Login: sign in with email and password. Everyone uses this screen; the database decides
// the role afterwards (docs/DECISIONS.md #7, #11). Links to create an account and to reset a
// forgotten password.

import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInput } from 'react-native';

import { isValidEmail, signIn, type MessageKey } from '@/auth/auth-actions';
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

  async function submit() {
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
    <Screen header={<BrandHeader />}>
      <LanguagePicker />

      <Section title={t('signIn.title')} description={t('signIn.subtitle')}>
        {formError ? <Notice tone="error">{t(formError)}</Notice> : null}

        <TextField
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
