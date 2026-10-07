// A1 Create an account: name, email and password. A new login has no access until the
// database links it to a student record with the same email, or the Guru gives it a role
// (docs/DATABASE.md "Linking a login to a student"). The privacy notice is linked from here, with a
// line for children: under 18, sign-up happens at the class desk (docs/DECISIONS.md #150).

import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInput } from 'react-native';

import {
  isValidEmail,
  MIN_PASSWORD_LENGTH,
  signUp,
  type MessageKey,
} from '@/auth/auth-actions';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { LanguagePicker } from '@/components/language-picker';
import { Notice } from '@/components/notice';
import { PrivacyNoticeLink } from '@/components/privacy-notice-link';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';

type Field = 'name' | 'email' | 'password' | 'confirm';

/** Sign-up form. Shows "check your email" when Supabase needs the email confirmed first. */
export default function SignUpScreen() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, MessageKey>>>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  async function submit() {
    const errors: Partial<Record<Field, MessageKey>> = {};
    if (!name.trim()) errors.name = 'validation.nameRequired';
    if (!isValidEmail(email)) errors.email = 'validation.emailInvalid';
    if (password.length < MIN_PASSWORD_LENGTH) errors.password = 'validation.passwordTooShort';
    else if (confirm !== password) errors.confirm = 'validation.passwordsDontMatch';
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    const result = await signUp(name, email, password);
    setBusy(false);
    if (result.errorKey) setFormError(result.errorKey);
    else if (result.needsConfirmation) setSentTo(email.trim());
    // Otherwise the person is signed in and the app moves on by itself.
  }

  if (sentTo) {
    return (
      <Screen header={<BrandHeader compact />}>
        <Notice tone="success" title={t('signUp.checkEmailTitle')}>
          {t('signUp.checkEmail', { email: sentTo })}
        </Notice>
        <Button label={t('forgotPassword.backToSignIn')} onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen centred header={<BrandHeader compact />}>
      <LanguagePicker />

      <Section title={t('signUp.title')} description={t('signUp.subtitle')}>
        {formError ? <Notice tone="error">{t(formError)}</Notice> : null}

        <TextField
          label={t('signUp.fullName')}
          value={name}
          onChangeText={setName}
          error={fieldErrors.name && t(fieldErrors.name)}
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          submitBehavior="submit"
        />
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
          hint={t('signUp.passwordHint')}
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password && t(fieldErrors.password)}
          secret
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          submitBehavior="submit"
        />
        <TextField
          ref={confirmRef}
          label={t('signUp.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          error={fieldErrors.confirm && t(fieldErrors.confirm)}
          secret
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <AppText variant="small" tone="muted">
          {t('signUp.under18')}
        </AppText>
        <Button label={t('signUp.submit')} onPress={submit} loading={busy} />
        <PrivacyNoticeLink label={t('signUp.privacyNotice')} />
      </Section>
      <Button
        variant="link"
        label={t('signUp.haveAccount')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
      />
    </Screen>
  );
}
