// G4 + G5 entry, "Syllabus and lessons": the three levels, each with how many syllabus items it
// teaches and how many lessons and materials it has. A level opens its page (levels/[id].tsx),
// where the Guru edits the syllabus and the materials. Coordinators see the same pages read-only.
// Opened from the ring on the staff homes (components/staff-shortcuts.tsx). Data:
// src/data/syllabus-editor.ts and src/data/materials.ts.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { countMaterialsByLevel } from '@/data/materials';
import { fetchSyllabusByLevel, type LevelSyllabus } from '@/data/syllabus-editor';
import { levelName } from '@/i18n/labels';

type Loaded = { levels: LevelSyllabus[]; materials: Map<number | null, number> };

/** The three levels with their counts. */
export default function LevelsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  // undefined = loading, null = could not load.
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);

  const load = useCallback(async () => {
    const [levels, materials] = await Promise.all([fetchSyllabusByLevel(), countMaterialsByLevel()]);
    setLoaded(levels && materials ? { levels, materials } : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen underHeader onRefresh={load}>
      <Stack.Screen options={{ title: t('syllabusEditor.title') }} />
      <Notice tone="info">{isGuru ? t('syllabusEditor.introGuru') : t('syllabusEditor.introStaff')}</Notice>

      {loaded === undefined ? <LoadingCards /> : null}
      {loaded === null ? (
        <>
          <Notice tone="error" title={t('syllabusEditor.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {loaded
        ? loaded.levels.map((level) => (
            <ListRow
              key={level.levelId}
              leading="level"
              title={levelName(t, level.levelId)}
              details={[
                t('syllabusEditor.levelCounts', {
                  items: level.items.length,
                  materials: loaded.materials.get(level.levelId) ?? 0,
                }),
                ...(level.retired.length > 0 ? [t('syllabusEditor.retiredCount', { count: level.retired.length })] : []),
              ]}
              onPress={() => router.push({ pathname: '/staff/levels/[id]', params: { id: String(level.levelId) } })}
            />
          ))
        : null}
    </Screen>
  );
}
