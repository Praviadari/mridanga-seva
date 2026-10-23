// The student's page: under a guardian of a minor, whether they get the weekly email (0058, docs/DECISIONS.md
// #530-#539): the reason when not, the parent's written yes (form line D) recorded or withdrawn at the desk, and
// "Send again". Opt-in: nothing goes until the yes is recorded. The email's language is the one set for the
// attendance emails just above. Renders nothing before migration 0058 or for an adult student.
// Data: src/data/parent-digest.ts.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import type { MessageKey } from '@/data/errors';
import { fetchGuardianDigests, resendGuardianDigest, saveGuardianDigest, type GuardianDigest } from '@/data/parent-digest';
import { announce } from '@/lib/announce';
import { formatDate, localDate, localTime } from '@/lib/dates';
import { confirmReady, confirmShown } from '@/lib/second-tap';

/** The weekly-email lines for one student's guardians, keyed by guardian id; rendered per guardian. */
export function useGuardianDigests(studentId: string, minor: boolean) {
  // undefined = loading or hidden; null = could not load.
  const [digests, setDigests] = useState<Map<string, GuardianDigest> | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!minor) return;
    let cancelled = false;
    void fetchGuardianDigests(studentId).then((result) => {
      if (!cancelled) setDigests(result === 'missing' ? undefined : result);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, minor, attempt]);
  const reload = useCallback(async () => setAttempt((n) => n + 1), []);
  return { digests: minor ? digests : undefined, reload };
}

type Props = { digest: GuardianDigest | undefined; onChanged: () => Promise<void> };

/** Blocks after which recording the yes is pointless (the email could not go anyway). */
const NO_YES = new Set(['withdrawn', 'adult', 'no_consent', 'no_email', 'not_eligible']);

/** One guardian's weekly-email line. */
export function GuardianDigestLine({ digest, onChanged }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<'yes' | 'stop' | 'again' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; key: MessageKey } | null>(null);
  if (!digest) return null;

  const hasYes = digest.consentAt !== null;
  const canRecord = !hasYes && !(digest.block && NO_YES.has(digest.block));

  async function run(kind: 'yes' | 'stop' | 'again') {
    if (!digest) return;
    if (kind === 'yes' && !confirming) {
      // The yes is a consent: asked once more, in place, and the button ignores a double tap (#332).
      setConfirming(true);
      confirmShown();
      announce(t('parentDigest.confirmYes'));
      return;
    }
    if (kind === 'yes' && !confirmReady()) return;
    setConfirming(false);
    setBusy(kind);
    const errorKey = kind === 'again' ? await resendGuardianDigest(digest.guardianId) : await saveGuardianDigest(digest.guardianId, kind === 'yes');
    setMessage(errorKey ? { tone: 'error', key: errorKey } : { tone: 'success', key: `parentDigest.done.${kind}` });
    await onChanged();
    setBusy(null);
  }

  const status =
    digest.block === null
      ? t('parentDigest.on')
      : digest.block === 'switched_off' && hasYes
        ? t('parentDigest.agreedButOff')
        : t(`parentDigest.blocks.${digest.block}`);
  return (
    <>
      <AppText variant="small" tone={digest.block === null ? 'success' : 'muted'}>
        {status}
        {hasYes && digest.consentAt ? ` · ${t('parentDigest.agreedOn', { date: formatDate(localDate(digest.consentAt)) })}` : ''}
        {digest.lastSentAt
          ? ` · ${t('parentDigest.lastSent', { date: formatDate(localDate(digest.lastSentAt)), time: localTime(digest.lastSentAt) })}`
          : ''}
      </AppText>
      {canRecord ? (
        <Button
          variant="secondary"
          icon="guardian"
          loading={busy === 'yes'}
          label={confirming ? t('parentDigest.confirmYes') : t('parentDigest.recordYes')}
          onPress={() => void run('yes')}
        />
      ) : null}
      {digest.block === null ? (
        <Button variant="secondary" icon="send" loading={busy === 'again'} label={t('parentDigest.sendAgain')} onPress={() => void run('again')} />
      ) : null}
      {hasYes ? (
        <Button variant="secondary" icon="cancel" loading={busy === 'stop'} label={t('parentDigest.stop')} onPress={() => void run('stop')} />
      ) : null}
      {message ? <Notice tone={message.tone}>{t(message.key)}</Notice> : null}
    </>
  );
}
