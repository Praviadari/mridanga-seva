// Me, a staff member's own student screens (migration 0053, docs/DECISIONS.md #316, #319): "Coordinators are
// students too." When the Guru has linked a coordinator's (or the Guru's) login to their own student record, the
// staff home shows a Me circle that opens this ring of the student's own circles: My QR (saved on the phone, works
// without internet, #21), My progress (S4, with the practice panel), My attendance (S9) and Practice (S5 with the
// timer that logs practice). The screens are the student's own (student/...), opened under /staff/me so Back
// returns here (lib/own-area.ts). What a student's record gets from colleagues (check-in, ticks, the level) still
// comes from colleagues: nobody records about their own record (0053, own_record).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ModuleRing, type Module } from '@/components/module-ring';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { fetchStudentHome, type StudentHome } from '@/data/home';
import { keepMyCardSaved } from '@/data/my-student';
import { levelName } from '@/i18n/labels';
import { useLatestLoad } from '@/lib/latest-load';

/** Me: the own student record's circles. */
export default function MeScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load, 'not_found' = no own record.
  const [home, setHome] = useState<StudentHome | 'not_found' | null | undefined>(undefined);
  const beginLoad = useLatestLoad();

  const load = useCallback(async () => {
    const isNewest = beginLoad();
    // My QR saved on this phone before the door (R1-02, #303), as on the student home.
    void keepMyCardSaved(myId);
    const loaded = await fetchStudentHome();
    if (isNewest()) setHome(loaded);
  }, [myId, beginLoad]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const modules: Module[] = [
    { key: 'qr', icon: 'qr', tone: 'blue', label: t('tabs.myQr'), onPress: () => router.push('/staff/me/qr') },
    { key: 'progress', icon: 'syllabus', tone: 'purple', label: t('progress.title'), onPress: () => router.push('/staff/me/progress') },
    { key: 'visits', icon: 'visits', tone: 'teal', label: t('visitHistory.module'), onPress: () => router.push('/staff/me/visits') },
    { key: 'practice', icon: 'practice', tone: 'pink', label: t('practice.module'), onPress: () => router.push('/staff/me/practice') },
  ];

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('me.title') }} />
      {home === 'not_found' ? (
        <Notice tone="info" title={t('me.noRecordTitle')}>
          {t('me.noRecordBody')}
        </Notice>
      ) : (
        <AppText tone="muted">{t('me.intro')}</AppText>
      )}
      {home === null ? (
        <>
          <Notice tone="error" title={t('home.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button variant="secondary" icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {/* Shown while loading and without internet too: My QR works offline from the card saved on the phone. */}
      {home !== 'not_found' ? <ModuleRing modules={modules} /> : null}
      {home && home !== 'not_found' ? <LevelLine home={home} /> : null}
    </Screen>
  );
}

/** My level and its syllabus as one bar (the student home's strip, #242). */
function LevelLine({ home }: { home: StudentHome }) {
  const { t } = useTranslation();
  const level = levelName(t, home.levelId);
  const text =
    home.syllabusTotal > 0
      ? t('home.student.levelStrip', { level, done: home.syllabusDone, total: home.syllabusTotal })
      : t('home.student.levelStripNone', { level });
  return <ProgressBar done={home.syllabusDone} total={home.syllabusTotal} label={text} valueText={text} />;
}
