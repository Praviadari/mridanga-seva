// "2 check-ins are waiting for the signal" (docs/DECISIONS.md #593): how many saves of this screen's kind wait on this
// device (lib/offline-queue.ts), with Send now; and, once, how many the server refused or were too old to send, with
// Close. Nothing shows when nothing waits.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { clearReport, useQueuedCount, useSendReport, type QueuedSave } from '@/lib/offline-queue';
import { sendQueued } from '@/lib/offline-send';
import { spacing } from '@/theme/use-theme';

import { Button } from './button';
import { Notice } from './notice';

/** door: check-ins (scans and taps) on Mark attendance; practice: the timer and the practice log. */
export type QueuedKind = 'door' | 'practice';

const KINDS: Record<QueuedKind, readonly QueuedSave['kind'][]> = { door: ['scan', 'mark'], practice: ['practice'] };

/** The waiting count for this screen's saves, and the last sending's report. */
export function QueuedNotice({ kind }: { kind: QueuedKind }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const count = useQueuedCount(profile?.id, KINDS[kind]);
  const report = useSendReport();
  const [busy, setBusy] = useState(false);
  if (count === 0 && !report) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {count > 0 ? (
        <>
          <Notice tone="info" title={t(kind === 'door' ? 'offlineQueue.doorWaiting' : 'offlineQueue.practiceWaiting', { count })}>
            {t(kind === 'door' ? 'offlineQueue.doorBody' : 'offlineQueue.practiceBody')}
          </Notice>
          <Button
            variant="secondary"
            icon="refresh"
            label={t('offlineQueue.sendNow')}
            loading={busy}
            onPress={() => {
              if (!profile) return;
              setBusy(true);
              void sendQueued(profile.id).finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
      {report ? (
        <>
          <Notice tone="warning" title={t('offlineQueue.notSavedTitle')}>
            {[
              report.refused > 0 ? t('offlineQueue.refused', { count: report.refused }) : '',
              report.tooOld > 0 ? t('offlineQueue.tooOld', { count: report.tooOld }) : '',
            ]
              .filter(Boolean)
              .join(' ')}
          </Notice>
          <Button variant="link" label={t('offlineQueue.close')} onPress={clearReport} />
        </>
      ) : null}
    </View>
  );
}
