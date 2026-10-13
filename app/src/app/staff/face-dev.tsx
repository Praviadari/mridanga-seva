// C26 Face scan test, the developer screen (Phase 3 P3-3, docs/DECISIONS.md #312): hidden. Reached only from staff My profile,
// and only on a TEST build (development or the 'preview' channel) while the server's switch is on
// (components/face-entries.tsx FaceDevSection). Checks both again here, so a typed address shows nothing more.
// The working part is src/face/face-dev-panel.tsx (camera → ML Kit → SFace + MiniFASNet, in memory only).

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { fetchFaceSwitch } from '@/data/face';
import { FaceDevPanel } from '@/face/face-dev-panel';
import { faceDevAllowed } from '@/face/face-dev-flag';

export default function FaceDevScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const staff = profile?.role === 'guru' || profile?.role === 'coordinator';
  const allowed = staff && faceDevAllowed();
  const [on, setOn] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (allowed) void fetchFaceSwitch().then(setOn);
  }, [allowed]);

  return (
    <Screen underHeader>
      <Stack.Screen options={{ title: t('face.dev.title') }} />
      {allowed && on === undefined ? <LoadingCards /> : null}
      {!allowed || on === false ? <Notice tone="info">{t('face.dev.notHere')}</Notice> : null}
      {allowed && on ? <FaceDevPanel /> : null}
    </Screen>
  );
}
