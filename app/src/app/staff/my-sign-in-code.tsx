// Sign-in code, from My profile (staff; 0061, docs/DECISIONS.md #580-#582): set up a code in an authenticator app
// (Google Authenticator, Microsoft Authenticator, Authy ...): a QR code to scan with another phone, the key to type
// in, or, on the phone itself, a button that opens the authenticator; then one code from the app confirms it. From
// then on every sign-in with the password asks the code (sign-in-code.tsx). Setting it up again (a new phone)
// replaces the old one once the new one is confirmed. Turning it off is offered only while the Guru does not ask
// for codes. Data: src/data/staff-mfa.ts.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { CODE_LENGTH, groupedKey, typedCode } from '@/auth/mfa';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { ScreenIntro } from '@/components/more-text';
import { Notice } from '@/components/notice';
import { QrCode } from '@/components/qr-code';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { TextField } from '@/components/text-field';
import type { MessageKey } from '@/data/errors';
import { confirmCodeSetup, fetchMyCodeState, startCodeSetup, turnOffMyCode, type CodeSetup, type MyCodeState } from '@/data/staff-mfa';
import { announce } from '@/lib/announce';
import { confirmReady, confirmShown } from '@/lib/second-tap';

export default function MySignInCodeScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  // undefined = loading, null = could not load, 'missing' = the database has no sign-in codes yet (before 0061).
  const [state, setState] = useState<MyCodeState | 'missing' | null | undefined>(undefined);
  const [setup, setSetup] = useState<CodeSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [done, setDone] = useState<'on' | 'off' | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);

  const load = useCallback(async () => {
    setState(await fetchMyCodeState());
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function begin() {
    setBusy(true);
    setErrorKey(null);
    setDone(null);
    const started = await startCodeSetup();
    setBusy(false);
    if ('errorKey' in started) setErrorKey(started.errorKey);
    else {
      setCode('');
      setSetup(started);
    }
  }

  async function confirm() {
    if (!setup || busy) return;
    if (code.length !== CODE_LENGTH) {
      setErrorKey('signInCode.sixDigits');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    const failed = await confirmCodeSetup(setup.factorId, code);
    setBusy(false);
    if (failed) {
      setErrorKey(failed);
      setCode('');
      return;
    }
    setSetup(null);
    setDone('on');
    announce(t('myCode.isOnNow'));
    await load();
  }

  async function turnOff() {
    if (!confirmingOff) {
      // Asked once more, in place; the button ignores a double tap (#332).
      setConfirmingOff(true);
      confirmShown();
      announce(t('myCode.confirmOff'));
      return;
    }
    if (!confirmReady()) return;
    setConfirmingOff(false);
    setBusy(true);
    const failed = await turnOffMyCode();
    setBusy(false);
    if (failed) setErrorKey(failed);
    else setDone('off');
    await load();
  }

  const header = <Stack.Screen options={{ title: t('myCode.title') }} />;
  if (state === undefined || state === null || state === 'missing') {
    return (
      <Screen underHeader centred>
        {header}
        {state === undefined ? <LoadingCards /> : null}
        {state === 'missing' ? <Notice tone="info">{t('myCode.missing')}</Notice> : null}
        {state === null ? (
          <>
            <Notice tone="error">{t('common.networkError')}</Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  // The session's own list is newer than the database's answer right after a set-up or a turn-off.
  const hasCode = state.hasCode === true || (session?.user.factors ?? []).some((f) => f.status === 'verified');
  const onPhone = Platform.OS !== 'web';

  return (
    <Screen underHeader>
      {header}
      <ScreenIntro text={t('myCode.intro')} />
      {state.required ? <Notice tone="info">{t('myCode.guruAsks')}</Notice> : null}
      {done === 'on' ? <Notice tone="success">{t('myCode.isOnNow')}</Notice> : null}
      {done === 'off' ? <Notice tone="success">{t('myCode.isOffNow')}</Notice> : null}
      {errorKey && !setup ? <Notice tone="error">{t(errorKey)}</Notice> : null}

      {setup ? (
        <Section icon="qr" title={t('myCode.setupTitle')} description={t('myCode.setupHint')}>
          <AppText>{t(onPhone ? 'myCode.stepOnePhone' : 'myCode.stepOne')}</AppText>
          {onPhone ? (
            <Button variant="secondary" icon="open" label={t('myCode.openApp')} onPress={() => void Linking.openURL(setup.uri).catch(() => setErrorKey('myCode.noApp'))} />
          ) : null}
          <QrCode value={setup.uri} size={220} label={t('myCode.qrLabel')} />
          <AppText variant="small" tone="muted">
            {t('myCode.keyHint')}
          </AppText>
          <AppText variant="label" family="sans" selectable>
            {groupedKey(setup.secret)}
          </AppText>
          <AppText>{t('myCode.stepTwo')}</AppText>
          {errorKey ? <Notice tone="error">{t(errorKey)}</Notice> : null}
          <TextField
            kind="number"
            label={t('signInCode.codeLabel')}
            value={code}
            onChangeText={(text) => setCode(typedCode(text))}
            maxLength={CODE_LENGTH}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="go"
            onSubmitEditing={() => void confirm()}
          />
          <Button icon="check" label={t('myCode.confirm')} loading={busy} onPress={() => void confirm()} />
          <Button variant="secondary" icon="cancel" label={t('myCode.cancel')} disabled={busy} onPress={() => { setSetup(null); setErrorKey(null); }} />
        </Section>
      ) : (
        <Section icon="settings" title={hasCode ? t('myCode.onTitle') : t('myCode.offTitle')} description={hasCode ? t('myCode.onHint') : t('myCode.offHint')}>
          <Button
            variant={hasCode ? 'secondary' : 'primary'}
            icon="qr"
            label={hasCode ? t('myCode.newPhone') : t('myCode.setUp')}
            loading={busy && !confirmingOff}
            onPress={() => void begin()}
          />
          {hasCode && !state.required ? (
            <Button
              variant="secondary"
              icon="close"
              label={confirmingOff ? t('myCode.confirmOff') : t('myCode.turnOff')}
              disabled={busy}
              onPress={() => void turnOff()}
            />
          ) : null}
          {hasCode && state.required ? <AppText tone="muted">{t('myCode.cannotTurnOff')}</AppText> : null}
        </Section>
      )}

      <Section icon="info" title={t('signInCode.lostTitle')}>
        <AppText tone="muted">{t('signInCode.lostBody')}</AppText>
      </Section>
    </Screen>
  );
}
