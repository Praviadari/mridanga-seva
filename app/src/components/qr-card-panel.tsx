// The "QR card" part of a student's profile (C8; Phase 3 P3-1, docs/DECISIONS.md #249-#252): print
// this student's card (opens C24 with the student picked) and, for the Guru, replace a lost card —
// the student gets a new code and the old card scans as "Code not recognised". Asks first, in
// place, as the other destructive actions do.

import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { Section } from '@/components/section';
import { reissueQrCode } from '@/data/qr-cards';
import { spacing } from '@/theme/use-theme';

/** Print and (the Guru) replace one student's QR card. */
export function QrCardPanel({ studentId }: { studentId: string }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  async function replace() {
    setBusy(true);
    const outcome = await reissueQrCode(studentId);
    setBusy(false);
    setAsking(false);
    setMessage(outcome.errorKey ? { tone: 'error', text: t(outcome.errorKey) } : { tone: 'success', text: t('qrCards.replaced') });
  }

  return (
    <Section icon="qr" title={t('qrCards.section')} description={t('qrCards.sectionHint')}>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <View style={styles.row}>
        <Button
          variant="secondary"
          icon="print"
          label={t('qrCards.printOne')}
          onPress={() => router.push({ pathname: '/staff/qr-cards', params: { ids: studentId } })}
        />
        {isGuru && !asking ? (
          <Button
            variant="link"
            icon="refresh"
            label={t('qrCards.replace')}
            onPress={() => {
              setMessage(null);
              setAsking(true);
            }}
          />
        ) : null}
      </View>
      {asking ? (
        <>
          <Notice tone="error" title={t('qrCards.replaceAsk')}>
            {t('qrCards.replaceAskBody')}
          </Notice>
          <View style={styles.row}>
            <Button icon="refresh" label={t('qrCards.replaceYes')} loading={busy} disabled={busy} onPress={() => void replace()} />
            <Button variant="link" label={t('qrCards.cancel')} disabled={busy} onPress={() => setAsking(false)} />
          </View>
        </>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
});
