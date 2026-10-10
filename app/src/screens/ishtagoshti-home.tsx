// I1 Ishtagoshti home, the tab for every role (Phase 2 slice 6, docs/DECISIONS.md #57), circles
// since the simple home (10-10-2026, #243): a line on what Ishtagoshti is, then the ring of its
// screens around the drum: the sloka of the day (pinned by an editor, or the published slokas in
// turn, the same for everyone; opens the sloka), the themes (screens/ishtagoshti-themes.tsx) and all
// slokas. Editors (the Guru and coordinators the Guru marked) also get Add a sloka and Add a theme;
// the Guru also the subscriber list (I15, slice 7). Under the ring: how many slokas I have
// memorised and how many there are. Routes: student/(tabs)/ishtagoshti.tsx,
// staff/(tabs)/ishtagoshti.tsx and, for public subscribers, subscriber/(tabs)/ishtagoshti.tsx
// (docs/DECISIONS.md #88). Data: src/data/ishtagoshti.ts.

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { openIg, type IgArea } from '@/components/ishtagoshti-parts';
import { LoadingCards } from '@/components/loading-cards';
import { ModuleRing, type Module } from '@/components/module-ring';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { fetchIshtagoshtiHome, type IshtagoshtiHome as Home } from '@/data/ishtagoshti';

/** I1 for students, staff or subscribers. */
export function IshtagoshtiHome({ area }: { area: IgArea }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [home, setHome] = useState<Home | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!profile) return;
    setHome(await fetchIshtagoshtiHome(profile.id));
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = home?.today ?? null;
  const modules: Module[] = home
    ? [
        ...(today
          ? [{ key: 'today', icon: 'today', tone: 'orange', label: t('ishtagoshti.today'), onPress: () => openIg.sloka(area, today.id) } satisfies Module]
          : []),
        { key: 'themes', icon: 'theme', tone: 'purple', label: t('ishtagoshti.themes'), onPress: () => openIg.themes(area) },
        { key: 'slokas', icon: 'sloka', tone: 'blue', label: t('ishtagoshti.allSlokas'), onPress: () => openIg.slokas(area) },
        ...(home.canEdit
          ? ([
              { key: 'addSloka', icon: 'add', tone: 'green', label: t('ishtagoshti.addSloka'), onPress: () => openIg.editSloka('new') },
              { key: 'addTheme', icon: 'add', tone: 'teal', label: t('ishtagoshti.addTheme'), onPress: () => openIg.editTheme('new') },
            ] satisfies Module[])
          : []),
        ...(area === 'staff' && profile?.role === 'guru'
          ? [
              {
                key: 'subscribers',
                icon: 'groups',
                tone: 'pink',
                label: t('igSubscribers.title'),
                onPress: () => router.push('/staff/ishtagoshti/subscribers'),
              } satisfies Module,
            ]
          : []),
      ]
    : [];

  return (
    <Screen underHeader onRefresh={load}>
      <AppText tone="muted">{t('ishtagoshti.intro')}</AppText>
      {home === undefined ? <LoadingCards /> : null}
      {home === null ? (
        <>
          <Notice tone="error" title={t('ishtagoshti.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}

      {home ? (
        <>
          {!today ? (
            <EmptyState icon="ishtagoshti" title={t('ishtagoshti.noSlokas')} body={home.canEdit ? t('ishtagoshti.noSlokasEditor') : undefined} />
          ) : null}
          <ModuleRing modules={modules} />
          <StatGrid>
            <StatTile icon="memorised" value={String(home.memorised.size)} label={t('ishtagoshti.memorisedCount')} />
            <StatTile icon="sloka" value={String(home.slokas.filter((s) => s.published).length)} label={t('ishtagoshti.slokaCount')} onPress={() => openIg.slokas(area)} />
          </StatGrid>
        </>
      ) : null}
    </Screen>
  );
}
