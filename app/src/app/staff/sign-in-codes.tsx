// Sign-in codes, the Guru's (Running the class; 0061, docs/DECISIONS.md #582-#584): every active Guru and
// coordinator with whether they have set up a sign-in code; Reset for someone who lost or changed their phone (never
// the Guru's own: another Guru or the project owner, docs/OPERATIONS.md "Staff sign-in codes"); and the switch that
// makes parents' details, consents, call notes and the audit log ask for the code. The database refuses the switch
// until everyone has a code and the Guru's own session gave it, and lets a Guru without a code switch it off, so
// nobody is locked out. Data: src/data/staff-mfa.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { ScreenIntro } from '@/components/more-text';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import type { MessageKey } from '@/data/errors';
import { fetchStaffCodes, resetStaffCode, switchStaffCodes, type StaffCodes } from '@/data/staff-mfa';
import { announce } from '@/lib/announce';
import { formatDate, localDate } from '@/lib/dates';
import { confirmReady, confirmShown } from '@/lib/second-tap';

export default function SignInCodesScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load, 'missing' = before 0061.
  const [codes, setCodes] = useState<StaffCodes | 'missing' | null | undefined>(undefined);
  const [confirming, setConfirming] = useState<string | null>(null); // 'switch' or a profile id to reset
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; key: MessageKey; name?: string } | null>(null);

  const load = useCallback(async () => {
    setCodes(await fetchStaffCodes());
  }, []);
  useFocusEffect(
    useCallback(() => {
      if (profile?.role === 'guru') void load();
    }, [load, profile?.role]),
  );

  if (profile?.role !== 'guru') return <GuruOnly title={t('staffCodes.title')} />;
  const header = <Stack.Screen options={{ title: t('staffCodes.title') }} />;
  if (codes === undefined || codes === null || codes === 'missing') {
    return (
      <Screen underHeader centred>
        {header}
        {codes === undefined ? <LoadingCards /> : null}
        {codes === 'missing' ? <Notice tone="info">{t('myCode.missing')}</Notice> : null}
        {codes === null ? (
          <>
            <Notice tone="error">{t('common.networkError')}</Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const without = codes.staff.filter((s) => s.hasCode !== true);
  const turnOn = !codes.required;

  /** The first tap asks again in place; the second does it (#332). */
  function askFirst(what: string, words: string): boolean {
    if (confirming !== what) {
      setConfirming(what);
      confirmShown();
      announce(words);
      return true;
    }
    return !confirmReady();
  }

  async function flip() {
    if (askFirst('switch', t(turnOn ? 'staffCodes.confirmOn' : 'staffCodes.confirmOff'))) return;
    setConfirming(null);
    setBusy(true);
    const result = await switchStaffCodes(turnOn);
    setBusy(false);
    if ('errorKey' in result) setMessage({ tone: 'error', key: result.errorKey });
    else {
      setMessage({ tone: 'success', key: turnOn ? 'staffCodes.nowOn' : 'staffCodes.nowOff' });
      setCodes(result.codes);
    }
  }

  async function reset(id: string, name: string) {
    if (askFirst(id, t('staffCodes.confirmReset', { name }))) return;
    setConfirming(null);
    setBusy(true);
    const failed = await resetStaffCode(id);
    setBusy(false);
    setMessage(failed ? { tone: 'error', key: failed } : { tone: 'success', key: 'staffCodes.resetDone', name });
    await load();
  }

  return (
    <Screen underHeader onRefresh={load}>
      {header}
      <ScreenIntro text={t('staffCodes.intro')} />
      {message ? <Notice tone={message.tone}>{t(message.key, { name: message.name ?? '' })}</Notice> : null}

      <Section icon="settings" title={t('staffCodes.switchTitle')} description={t('staffCodes.switchHint')}>
        <AppText variant="label" tone={codes.required ? 'success' : 'default'}>
          {codes.required ? t('staffCodes.isOn') : t('staffCodes.isOff')}
        </AppText>
        {turnOn && without.length > 0 ? <AppText tone="muted">{t('staffCodes.waitingFor', { count: without.length })}</AppText> : null}
        {!codes.myAal2 ? <AppText tone="muted">{t('staffCodes.thisSession')}</AppText> : null}
        <Button
          variant={turnOn ? 'primary' : 'secondary'}
          icon={turnOn ? 'check' : 'pause'}
          loading={busy && confirming === null}
          label={confirming === 'switch' ? t(turnOn ? 'staffCodes.confirmOn' : 'staffCodes.confirmOff') : t(turnOn ? 'staffCodes.switchOn' : 'staffCodes.switchOff')}
          onPress={() => void flip()}
        />
        <Button variant="link" label={t('staffCodes.mine')} onPress={() => router.push('/staff/my-sign-in-code')} />
      </Section>

      <Section icon="groups" title={t('staffCodes.listTitle')} description={t('staffCodes.listHint')}>
        {codes.staff.map((s) => {
          const name = s.fullName.trim() || '—';
          const status =
            s.hasCode === true
              ? t('staffCodes.hasCode', { date: s.since ? formatDate(localDate(s.since)) : '' })
              : s.hasCode === false
                ? t('staffCodes.noCode')
                : t('staffCodes.unknown');
          const me = s.id === profile.id;
          return (
            <ListRow
              key={s.id}
              leading={s.hasCode === true ? 'check' : 'alert'}
              title={name}
              details={[s.role === 'guru' ? t('roles.guru') : t('roles.coordinator'), status]}
              highlight={s.hasCode === true ? undefined : 'attention'}
              action={
                s.hasCode === true && !me
                  ? {
                      variant: 'secondary',
                      label: confirming === s.id ? t('staffCodes.confirmResetShort') : t('staffCodes.reset'),
                      accessibilityLabel: t('staffCodes.resetFor', { name }),
                      disabled: busy,
                      onPress: () => void reset(s.id, name),
                    }
                  : undefined
              }
            />
          );
        })}
      </Section>
    </Screen>
  );
}
