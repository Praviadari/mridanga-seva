// Sign-in code (0061, docs/DECISIONS.md #581): after the password, a staff member who set up a sign-in code types
// the six digits their authenticator app shows. Open only in the 'signInCode' area (src/auth/auth-provider.tsx);
// once the code is right the session counts as having given it (aal2) and the app moves on to their screens.
// No "skip": a lost phone is reset by the Guru (or, for the Guru, by another Guru or the project owner,
// docs/OPERATIONS.md "Staff sign-in codes"); Sign out is always there.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { CODE_LENGTH, codeFactorId, typedCode } from '@/auth/mfa';
import { AppText } from '@/components/app-text';
import { BrandHeader } from '@/components/brand';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SignOutButton } from '@/components/sign-out-button';
import { TextField } from '@/components/text-field';
import type { MessageKey } from '@/data/errors';
import { giveSignInCode } from '@/data/staff-mfa';

/** The six digits from the authenticator app, then the person's screens. */
export default function SignInCodeScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const factorId = codeFactorId(session);

  async function submit() {
    if (busy) return; // Enter pressed again while the request runs (D6-17)
    if (code.length !== CODE_LENGTH) {
      setErrorKey('signInCode.sixDigits');
      return;
    }
    if (!factorId) {
      setErrorKey('signInCode.wasReset');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    const failed = await giveSignInCode(factorId, code);
    setBusy(false);
    // Right: the auth provider moves on by itself (the new session gave the code).
    if (failed) {
      setErrorKey(failed);
      setCode('');
    }
  }

  return (
    <Screen centred header={<BrandHeader compact />}>
      <Section title={t('signInCode.title')} description={t('signInCode.intro')}>
        {session?.user.email ? <Notice tone="info">{t('signInCode.signedInAs', { email: session.user.email })}</Notice> : null}
        {errorKey ? <Notice tone="error">{t(errorKey)}</Notice> : null}
        <TextField
          kind="number"
          label={t('signInCode.codeLabel')}
          hint={t('signInCode.codeHint')}
          value={code}
          onChangeText={(text) => setCode(typedCode(text))}
          maxLength={CODE_LENGTH}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Button icon="check" label={t('signInCode.submit')} loading={busy} onPress={() => void submit()} />
      </Section>
      <Section title={t('signInCode.lostTitle')}>
        <AppText tone="muted">{t('signInCode.lostBody')}</AppText>
      </Section>
      <SignOutButton variant="link" />
    </Screen>
  );
}
