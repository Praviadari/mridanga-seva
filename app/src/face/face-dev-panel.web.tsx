// Web stand-in for src/face/face-dev-panel.tsx: no camera models on the web (docs/DECISIONS.md #312).

import { useTranslation } from 'react-i18next';

import { Notice } from '@/components/notice';

export function FaceDevPanel() {
  const { t } = useTranslation();
  return <Notice tone="info">{t('face.appOnly')}</Notice>;
}
