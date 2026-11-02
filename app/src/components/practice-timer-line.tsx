// The practice timer as one slim line (#384): Start by hand (or the first sound of Practice tools), the time while it
// runs with Stop and save and Throw away, and what happened when it was stopped; Stop logs it when it ran at least a
// minute (S6; lib/practice-timer.ts, data/practice.ts), or keeps the minutes on the phone without a signal (#593).
// Shown on Practice tools (screens/practice-tools.tsx) and on the chapter screen (screens/chapter.tsx, #786), for a
// student and for Me > Practice of a staff member's own record (0053, #319).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { logPractice, type Practised } from '@/data/practice';
import { NETWORK, queuePractice } from '@/lib/offline-send';
import { clearPracticeTimer, MAX_ENTRY_MINUTES, startPracticeTimer, TIMER_LIMIT_MS, usePracticeTimer } from '@/lib/practice-timer';
import { useRequestId } from '@/lib/use-request-id';
import { radius, spacing, useTheme } from '@/theme/use-theme';

import { AppText } from './app-text';
import { Button } from './button';
import { Icon } from './icon';
import { Notice } from './notice';
import { FeelingPrompt } from './practice-feeling';
import { practiceTime } from './practice-parts';
import { QueuedNotice } from './queued-notice';

/**
 * Students: the practice timer as one slim line above the tools (#384), so Start stays on the first screen; while it
 * runs, the time with Stop and save, and Throw away under it; what happened when it was stopped.
 */
export function PracticeTimerLine({ profileId, onSaved }: { profileId: string; onSaved: () => void }) {
  // #322: one id per timed session, so Stop tapped again after a lost answer logs it once.
  const { requestId, renew: renewRequestId } = useRequestId();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const timer = usePracticeTimer(profileId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'info' | 'error'; text: string } | null>(null);
  // "How did it go?" (#494) for the entry just saved; the chips start with Taal when the timer played one.
  const [asking, setAsking] = useState<{ id: number; initial: Practised[] } | null>(null);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [timer]);

  const elapsedMs = timer ? now - Date.parse(timer.startedAt) : 0;
  const minutes = Math.max(0, Math.floor(elapsedMs / 60000));

  const stop = async () => {
    if (!timer) return;
    const ms = Date.now() - Date.parse(timer.startedAt);
    const done = Math.floor(ms / 60000);
    if (ms > TIMER_LIMIT_MS) {
      clearPracticeTimer();
      setResult({ tone: 'info', text: t('practice.timerForgotten') });
      return;
    }
    if (done < 1) {
      clearPracticeTimer();
      setResult({ tone: 'info', text: t('practice.timerTooShort') });
      return;
    }
    setBusy(true);
    const logged = Math.min(done, MAX_ENTRY_MINUTES);
    const entry = { minutes: logged, source: 'timer' as const, startedAt: timer.startedAt, taalId: timer.taalId };
    const saved = await logPractice(entry, requestId());
    setBusy(false);
    if ('errorKey' in saved && saved.errorKey === NETWORK) {
      // No connection: the minutes are counted now, at Stop, and wait on the phone with this entry's request id
      // (#593); the timer stops, so nothing goes on counting.
      queuePractice(profileId, requestId(), entry);
      clearPracticeTimer();
      renewRequestId();
      setResult({ tone: 'info', text: t('offlineQueue.practiceQueued', { time: practiceTime(t, logged) }) });
      return;
    }
    if ('errorKey' in saved) {
      // Kept running, so nothing is lost; the student can try again or type it in S6.
      setResult({ tone: 'error', text: t(saved.errorKey) });
      return;
    }
    clearPracticeTimer();
    renewRequestId();
    setResult({ tone: 'success', text: t('practice.timerLogged', { time: practiceTime(t, logged) }) });
    setAsking(saved.id !== null ? { id: saved.id, initial: timer.taalId !== null ? ['taal'] : [] } : null);
    onSaved();
  };

  return (
    <View style={styles.timerWrap}>
      <View style={[styles.timerLine, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="time" size={22} color={colors.primary} />
        <AppText variant={timer ? 'label' : 'small'} tone={timer ? 'default' : 'muted'} style={styles.timerText}>
          {timer ? t('practice.timerRunning', { time: practiceTime(t, minutes) }) : t('practice.timerIdle')}
        </AppText>
        {timer ? (
          <Button variant="link" icon="check" label={t('practice.timerStop')} loading={busy} onPress={() => void stop()} />
        ) : (
          <Button
            variant="link"
            label={t('practice.timerStartNow')}
            accessibilityLabel={t('practice.timerStart')}
            onPress={() => {
              setResult(null);
              setAsking(null);
              startPracticeTimer(profileId, null);
            }}
          />
        )}
      </View>
      {timer ? (
        <Button
          variant="link"
          label={t('practice.timerDiscard')}
          onPress={() => {
            clearPracticeTimer();
            setResult(null);
          }}
        />
      ) : null}
      {result ? <Notice tone={result.tone}>{result.text}</Notice> : null}
      <QueuedNotice kind="practice" />
      {asking && !timer ? <FeelingPrompt key={asking.id} entryId={asking.id} initial={asking.initial} onClose={() => setAsking(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  timerWrap: {
    gap: spacing.xs,
  },
  timerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    borderWidth: 1,
    borderRadius: radius,
  },
  timerText: {
    flex: 1,
  },
});
