// Web stand-in for src/face/face-scanner.tsx: the web app has no face scan (no camera models, no Keystore;
// docs/DECISIONS.md #308), so it only says so. Keeps the native packages out of the web bundle.

import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';

import type { EnrolSample } from './enrolment';

export type FaceScannerProps = {
  frames: number;
  onDone: (samples: EnrolSample[]) => void;
  onCancel: () => void;
};

export function FaceScanner({ onCancel }: FaceScannerProps) {
  const { t } = useTranslation();
  return (
    <>
      <Notice tone="info">{t('face.appOnly')}</Notice>
      <Button variant="secondary" label={t('face.scan.cancel')} onPress={onCancel} />
    </>
  );
}
