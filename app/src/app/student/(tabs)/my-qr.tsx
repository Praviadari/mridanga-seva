// S3 My QR card. The student opens it at the door; the coordinator scans the code with their own
// phone on Mark attendance (C5) to check the student in or out (docs/ARCHITECTURE.md "How
// attendance flows"). The code holds the student's secret qr_token, never the roll number, so no
// one can make a working code for another student from a class list. The name and roll number
// are printed under it so the coordinator can see it is the right person. The card saved on the
// phone is shown at once, before the server answers, so nobody waits at the door without signal.
// At the door (audit phase 5 U2-02, docs/DECISIONS.md #342): the screen stays awake while My QR is in view, and a
// line above the card says whether today's check-in is recorded ("Checked in at 16:05"), asked again every 5 s for
// up to 10 minutes while in view and read out by TalkBack when it changes, so the student sees the scan worked.
// Since 15-10-2026 (#381) the card is a pass, white in light and dark mode alike, and a check-in is a green box with a
// tick that pops in and, when the scan lands while the screen is open, one success buzz.
// Brighter screen: with the next APK (expo-brightness is not in the app yet).

import { Stack, useFocusEffect } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { MoreText } from '@/components/more-text';
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
import { lightPalette, qrColours } from '@/theme/colors';
import { useHeadingFont } from '@/theme/fonts';
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
  const titleFont = useHeadingFont();
  const { width } = useWindowDimensions();

  // undefined = still loading.
  const [result, setResult] = useState<MyCardResult | undefined>(undefined);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const profileId = profile?.id;

  // Asked each time My QR comes into view, not once: it is a tab and stays mounted, so a code the Guru gave anew
  // (a lost printed card, reissue_qr_code 0045) or a record unlinked meanwhile reaches the screen without a restart
  // (launch audit LA-02, docs/DECISIONS.md #391). The card on screen stays until the answer comes.
  useFocusEffect(
    useCallback(() => {
      if (!profileId) return undefined;
      let cancelled = false;
      fetchMyCard(profileId).then((loaded) => {
        if (!cancelled) setResult(loaded);
      });
      return () => {
        cancelled = true;
      };
    }, [profileId, loadAttempt]),
  );

  // Until the server answers, show the card saved on this phone (without the "no internet" note:
  // that is not known yet). On a stalled connection the answer takes up to the read time limit
  // (10 s, lib/timed-fetch.ts); the student must not stand at the door looking at "Loading".
  const savedNow = useMemo(() => (profileId ? savedCardFor(profileId) : null), [profileId]);
  const shown: MyCardResult | undefined =
    result ?? (savedNow ? { state: 'ok', card: savedNow, saved: false } : undefined);

  // The page's side padding and the pass's edge come off the screen width; the code's own white border is the
  // pass's margin (#381).
  const column = Math.min(width, maxContentWidth) - 2 * spacing.md - 2;
  const qrSize = Math.min(column, MAX_QR_SIZE);

  const header = <Stack.Screen options={{ title: t('myQr.title') }} />;
  const door = useDoorStatus(shown?.state === 'ok');
  // The door moment (#381): the scan landed while My QR was open (not yet checked in, then checked in), so the
  // phone buzzes once; opened after the scan, the green line shows without a buzz.
  const [sawNotYet, setSawNotYet] = useState(false);
  if (door?.kind === 'none' && !sawNotYet) setSawNotYet(true);
  const landed = sawNotYet && door?.kind === 'in';

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
      <DoorLine status={door} landed={landed} />
      {/* A pass, like a boarding pass in a phone wallet (#381): the night strip with the app's name in gold, then a
          white body, in light and dark mode alike, so the code is the brightest thing on the screen at the door. */}
      <View style={[styles.pass, cardLook(colors), { backgroundColor: qrColours.light }]}>
        <View style={[styles.passTop, { backgroundColor: lightPalette.bar }]}>
          <MridangaMark size={26} color={lightPalette.headerGold} accent={lightPalette.bar} />
          <AppText
            variant="label"
            style={[styles.passName, { color: lightPalette.headerGold }, titleFont ? { fontFamily: titleFont, fontWeight: 'normal' } : null]}>
            {t('app.name')}
          </AppText>
        </View>
        <QrCode value={studentQrText(card.qrToken)} size={qrSize} label={t('myQr.qrLabel')} />
        <View style={styles.passFoot}>
          <AppText variant="subtitle" family="sans" style={[styles.centreText, styles.name, { color: lightPalette.text }]}>
            {card.fullName}
          </AppText>
          {card.rollNo ? (
            <AppText style={[styles.centreText, styles.rollNo, { color: lightPalette.textMuted }]}>
              {t('myQr.rollNo', { rollNo: card.rollNo })}
            </AppText>
          ) : null}
        </View>
      </View>

      {saved ? <AppText tone="muted">{t('myQr.savedCopy')}</AppText> : null}
      <MoreText text={t('myQr.howTo')} />
      <View style={styles.private}>
        <Icon name="anonymous" size={18} color={colors.textMuted} />
        <AppText variant="small" tone="muted" style={styles.privateText}>
          {t('myQr.keepPrivate')}
        </AppText>
      </View>
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

/**
 * "Not checked in yet today" / "Checked out", a quiet line read out when it changes; once checked in, a green box
 * "Checked in at 16:05 · Hare Krishna! Your visit is recorded." whose tick pops in, with one success buzz when the
 * scan landed while the screen was open (`landed`, #381; components/notice.tsx).
 */
function DoorLine({ status, landed }: { status: DoorStatus | undefined; landed: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!status) return null;
  if (status.kind === 'in') {
    return (
      <Notice tone="success" haptic={landed} title={t('myQr.statusIn', { time: localTime(status.at) })}>
        {t('myQr.statusInBody')}
      </Notice>
    );
  }
  const text = status.kind === 'out' ? t('myQr.statusOut', { time: localTime(status.at) }) : t('myQr.statusNone');
  const colour = colors.textMuted;
  return (
    <View style={styles.doorLine}>
      <Icon name="time" size={22} color={colour} />
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
  pass: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  passTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  passName: {
    fontSize: 20,
    lineHeight: 28,
  },
  passFoot: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  centreText: {
    textAlign: 'center',
  },
  private: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  privateText: {
    flex: 1,
  },
});
