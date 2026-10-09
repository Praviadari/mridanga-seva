// A1 Set a new password. Opens only after the person follows a reset link from their email
// (web version; the auth provider sets area 'recovery'). Saving the password ends recovery and
// the app moves on to the person's screens. The screen names the account the link signed in
// (D3-03), and offers to sign out of this browser with the save: the link signed the person in
// here, and someone who uses the Android app or a shared computer should not stay signed in (FLOW-05).

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextInput } from 'react-native';

import { MIN_PASSWORD_LENGTH, setNewPassword, signOut, type MessageKey } from '@/auth/auth-actions';
import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';

/** New-password form. "Cancel" signs out, because the reset link has already signed them in. */
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const email = useAuth().session?.user.email;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: MessageKey; confirm?: MessageKey }>(
    {},
  );
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  /** Saves the new password; with `thenSignOut`, also signs out of this browser once it is saved. */
  async function submit(thenSignOut = false) {
    if (busy) return; // Enter pressed again while the request runs (D6-17)
    const errors = {
      password:
        password.length < MIN_PASSWORD_LENGTH ? ('validation.passwordTooShort' as const) : undefined,
      confirm:
        password.length >= MIN_PASSWORD_LENGTH && confirm !== password
          ? ('validation.passwordsDontMatch' as const)
          : undefined,
    };
    setFieldErrors(errors);
    setFormError(null);
    if (errors.password || errors.confirm) return;

    setBusy(true);
    const { errorKey } = await setNewPassword(password);
    setBusy(false);
    if (errorKey) setFormError(errorKey);
    else if (thenSignOut) await signOut();
  }

  return (
    <Screen centred header={<BrandHeader compact />}>
      <Section title={t('resetPassword.title')}>
        {email ? <Notice tone="info">{t('resetPassword.signedInAs', { email })}</Notice> : null}
        {formError ? <Notice tone="error">{t(formError)}</Notice> : null}

        <TextField
          label={t('resetPassword.newPassword')}
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
          onSubmitEditing={() => void submit()}
        />

        <Button label={t('resetPassword.submit')} onPress={() => void submit()} loading={busy} />
        <AppText variant="small" tone="muted">
          {t('resetPassword.browserNote')}
        </AppText>
        <Button variant="secondary" label={t('resetPassword.saveAndSignOut')} onPress={() => void submit(true)} disabled={busy} />
      </Section>
      <Button variant="link" label={t('resetPassword.cancel')} onPress={() => void signOut()} />
    </Screen>
  );
}
