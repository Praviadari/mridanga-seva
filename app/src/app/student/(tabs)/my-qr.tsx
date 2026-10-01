// S3 My QR card. The student opens it at the door; the coordinator scans the code with their own
// phone on Mark attendance (C5) to check the student in or out (docs/ARCHITECTURE.md "How
// attendance flows"). The code holds the student's secret qr_token, never the roll number, so no
// one can make a working code for another student from a class list. The name and roll number
// are printed under it so the coordinator can see it is the right person. The card saved on the
// phone is shown at once, before the server answers, so nobody waits at the door without signal.

import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { LoadingCards } from '@/components/loading-cards';
import { MridangaMark } from '@/components/mridanga-mark';
import { Notice } from '@/components/notice';
import { QrCode } from '@/components/qr-code';
import { Screen } from '@/components/screen';
import { studentQrText } from '@/data/attendance';
import { fetchMyCard, savedCardFor, type MyCardResult } from '@/data/my-student';
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
  // that is not known yet). Without signal the answer takes several seconds, because the database
  // client retries a failed request; the student must not stand at the door looking at "Loading".
  const savedNow = useMemo(() => (profileId ? savedCardFor(profileId) : null), [profileId]);
  const shown: MyCardResult | undefined =
    result ?? (savedNow ? { state: 'ok', card: savedNow, saved: false } : undefined);

  // The page's side padding and the card's own padding come off the screen width.
  const column = Math.min(width, maxContentWidth) - 2 * spacing.md - 2 * spacing.md;
  const qrSize = Math.min(column, MAX_QR_SIZE);

  const header = <Stack.Screen options={{ title: t('myQr.title') }} />;

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
        <Button label={t('common.tryAgain')} onPress={() => setLoadAttempt(loadAttempt + 1)} />
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
      <View style={[styles.card, cardLook(colors)]}>
        <View style={styles.brandRow}>
          <MridangaMark size={28} color={colors.primary} accent={colors.surface} />
          <AppText variant="label" tone="primary">
            {t('app.name')}
          </AppText>
        </View>
        <QrCode value={studentQrText(card.qrToken)} size={qrSize} label={t('myQr.qrLabel')} />
        <AppText variant="subtitle" style={styles.centreText}>
          {card.fullName}
        </AppText>
        {card.rollNo ? (
          <AppText tone="muted">{t('myQr.rollNo', { rollNo: card.rollNo })}</AppText>
        ) : null}
      </View>

      {saved ? <AppText tone="muted">{t('myQr.savedCopy')}</AppText> : null}
      <AppText>{t('myQr.howTo')}</AppText>
      <AppText tone="muted">{t('myQr.keepPrivate')}</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
