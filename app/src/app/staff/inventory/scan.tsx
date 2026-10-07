// C19: scan an asset label (docs/DECISIONS.md #159). The camera reads the label's QR link and opens
// the item (./label/[token].tsx resolves it). A student's attendance code is pointed to Mark
// attendance; anything else is "not a Mridanga Seva label".

import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { QrScanner } from '@/components/qr-scanner';
import { Screen } from '@/components/screen';
import { readScanText } from '@/lib/scan-text';

/** The label scanner. */
export default function ScanLabelScreen() {
  const { t } = useTranslation();
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  function onScan(text: string) {
    if (busy.current) return;
    const read = readScanText(text);
    if (read.kind === 'asset') {
      busy.current = true;
      router.push({ pathname: '/staff/inventory/label/[token]', params: { token: read.token } });
      // Ready again for the next label when this screen comes back.
      setTimeout(() => {
        busy.current = false;
      }, 1500);
      return;
    }
    setNotice(read.kind === 'student' ? t('labels.studentCode') : t('labels.notALabel'));
  }

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('labels.scanTitle') }} />
      <Notice tone="info">{t('labels.scanIntro')}</Notice>
      {notice ? <Notice tone="error">{notice}</Notice> : null}
      <QrScanner onScan={onScan} />
      {notice ? <Button variant="secondary" label={t('labels.scanAgain')} onPress={() => setNotice(null)} /> : null}
    </Screen>
  );
}
