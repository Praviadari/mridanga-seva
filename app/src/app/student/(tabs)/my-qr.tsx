// S3 My QR card. The student opens it at the door; the coordinator scans the code with their own
// phone on Mark attendance (C5) to check the student in or out (docs/ARCHITECTURE.md "How
// attendance flows"). The code holds the student's secret qr_token, never the roll number, so no
// one can make a working code for another student from a class list. The name and roll number
// are printed under it so the coordinator can see it is the right person. The card saved on the
// phone is shown at once, before the server answers, so nobody waits at the door without signal.
// At the door (audit phase 5 U2-02, docs/DECISIONS.md #342): the screen stays awake while My QR is in view, and a
// line above the card says whether today's check-in is recorded ("Checked in at 16:05"), asked again every 5 s for
// up to 10 minutes while in view and read out by TalkBack when it changes, so the student sees the scan worked.
// Brighter screen: with the next APK (expo-brightness is not in the app yet).

import { Stack, useFocusEffect } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { MridangaMark } from '@/components/mridanga-mark';
import { Notice } from '@/components/notice';
import { Icon } from '@/components/icon';
import { QrCode } from '@/components/qr-code';
import { Screen } from '@/components/screen';
import { StatusText } from '@/components/status-text';
import { studentQrText } from '@/data/attendance';
import { fetchStudentHome } from '@/data/home';
import { fetchMyCard, savedCardFor, type MyCardResult } from '@/data/my-student';
import { localDate, localTime, todayLocal } from '@/lib/dates';
import { DOOR_POLL_FOR_MS, DOOR_POLL_MS, doorStatus, type DoorStatus } from '@/lib/door-status';
import { cardLook, maxContentWidth, spacing, useTheme } from '@/theme/use-theme';

/**
 * Largest QR code drawn, in pixels. Big enough to scan from arm's length; bigger only makes the
 * coordinator step back.
 */
const MAX_QR_SIZE = 320;

/** The student's QR code with their name and roll number, and what to do with it. */
export default function MyQrScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  // undefined = still loading.
  const [result, setResult] = useState<MyCardResult | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const profileId = profile?.id;

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    fetchMyCard(profileId).then((loaded) => {
      if (!cancelled) setResult(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId, loadAttempt]);

  // Until the server answers, show the card saved on this phone (without the "no internet" note:
  // that is not known yet). On a stalled connection the answer takes up to the read time limit
  // (10 s, lib/timed-fetch.ts); the student must not stand at the door looking at "Loading".
  const savedNow = useMemo(() => (profileId ? savedCardFor(profileId) : null), [profileId]);
  const shown: MyCardResult | undefined =
    result ?? (savedNow ? { state: 'ok', card: savedNow, saved: false } : undefined);

  // The page's side padding and the card's own padding come off the screen width.
  const column = Math.min(width, maxContentWidth) - 2 * spacing.md - 2 * spacing.md;
  const qrSize = Math.min(column, MAX_QR_SIZE);

  const header = <Stack.Screen options={{ title: t('myQr.title') }} />;
  const door = useDoorStatus(shown?.state === 'ok');

  if (shown === undefined) {
    return (
      <Screen underHeader>
        {header}
        <LoadingCards rows={1} />
      </Screen>
    );
  }

  if (shown.state === 'failed') {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('myQr.loadFailed')}>
          {t(shown.errorKey)}
        </Notice>
        <Button icon="refresh" label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
      </Screen>
    );
  }

  if (shown.state === 'noRecord') {
    return (
      <Screen underHeader centred>
        {header}
        <Notice tone="error" title={t('myQr.noRecordTitle')}>
          {t('myQr.noRecordBody')}
        </Notice>
      </Screen>
    );
  }

  const { card, saved } = shown;
  return (
    <Screen underHeader>
      {header}
      <DoorLine status={door} />
      <View style={[styles.card, cardLook(colors)]}>
        <View style={styles.brandRow}>
          <MridangaMark size={28} color={colors.primary} accent={colors.surface} />
          <AppText variant="label" tone="primary">
            {t('app.name')}
          </AppText>
        </View>
        <QrCode value={studentQrText(card.qrToken)} size={qrSize} label={t('myQr.qrLabel')} />
        <AppText variant="subtitle" family="sans" style={[styles.centreText, styles.name]}>
          {card.fullName}
        </AppText>
        {card.rollNo ? (
          <AppText tone="muted" style={styles.rollNo}>
            {t('myQr.rollNo', { rollNo: card.rollNo })}
          </AppText>
        ) : null}
      </View>

      {saved ? <AppText tone="muted">{t('myQr.savedCopy')}</AppText> : null}
      <AppText>{t('myQr.howTo')}</AppText>
      <AppText tone="muted">{t('myQr.keepPrivate')}</AppText>
    </Screen>
  );
}

/**
 * Keeps the screen awake while My QR is in view (a tab stays mounted, so on focus, not on mount) and asks
 * student_home() for today's visit every 5 s, for at most 10 minutes. undefined until the first answer.
 */
function useDoorStatus(active: boolean): DoorStatus | undefined {
  const [status, setStatus] = useState<DoorStatus | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      const tag = 'my-qr';
      activateKeepAwakeAsync(tag).catch(() => undefined); // no wake lock (some browsers): the card still works
      let stopped = false;
      const started = Date.now();
      async function ask() {
        const home = await fetchStudentHome();
        if (stopped || !home || home === 'not_found') return;
        setStatus(doorStatus(home.hereNow, home.lastVisitAt, todayLocal(), localDate));
      }
      void ask();
      const timer = setInterval(() => {
        if (Date.now() - started > DOOR_POLL_FOR_MS) clearInterval(timer);
        else void ask();
      }, DOOR_POLL_MS);
      return () => {
        stopped = true;
        clearInterval(timer);
        deactivateKeepAwake(tag).catch(() => undefined);
      };
    }, [active]),
  );
  return status;
}

/** "Not checked in yet today" / "Checked in at 16:05" (green) / "Checked out", read out when it changes. */
function DoorLine({ status }: { status: DoorStatus | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!status) return null;
  const text =
    status.kind === 'in'
      ? t('myQr.statusIn', { time: localTime(status.at) })
      : status.kind === 'out'
        ? t('myQr.statusOut', { time: localTime(status.at) })
        : t('myQr.statusNone');
  const colour = status.kind === 'in' ? colors.success : colors.textMuted;
  return (
    <View style={styles.doorLine}>
      <Icon name={status.kind === 'in' ? 'check' : 'time'} size={22} color={colour} />
      <StatusText variant="label" style={[styles.doorText, { color: colour }]}>
        {text}
      </StatusText>
    </View>
  );
}

const styles = StyleSheet.create({
  doorLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  doorText: {
    flexShrink: 1,
  },
  name: {
    fontSize: 22,
    lineHeight: 30,
  },
  rollNo: {
    fontSize: 18,
    lineHeight: 26,
  },
  card: {
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  centreText: {
    textAlign: 'center',
  },
});
