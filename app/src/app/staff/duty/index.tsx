// C20 My duty roster (Phase 2 slice 8, docs/DECISIONS.md #65): "My shifts" (the signed-in
// person's own shifts in the next 4 weeks) and the whole roster by date, with who is on each
// shift, so a coordinator sees who they work with. The Guru adds a shift here and opens one to
// change or delete it (./[id].tsx). Everyone on a shift gets a reminder the evening before (inbox
// and push), which opens this screen. Data: data/duty.ts; migration 0023_team_tools.sql.

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { dayText, fetchRoster, type Shift } from '@/data/duty';

/** The roster. */
export default function DutyScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const isGuru = profile?.role === 'guru';
  const myId = profile?.id ?? '';
  const [shifts, setShifts] = useState<Shift[] | null | undefined>(undefined);

  const load = useCallback(async () => {
    setShifts(await fetchRoster());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const mine = shifts?.filter((s) => s.people.some((p) => p.id === myId)) ?? [];
  const days = [...new Set(shifts?.map((s) => s.onDate) ?? [])];
  const timeLine = (s: Shift) => [`${s.startsAt}-${s.endsAt}`, s.centreName, s.duty].filter(Boolean).join(' · ');
  const openShift = (s: Shift) => router.push({ pathname: '/staff/duty/[id]', params: { id: String(s.id) } });

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('duty.title') }} />
      <Notice tone="info">{isGuru ? t('duty.introGuru') : t('duty.introCoordinator')}</Notice>
      {isGuru ? <Button icon="add" label={t('duty.add')} onPress={() => router.push({ pathname: '/staff/duty/[id]', params: { id: 'new' } })} /> : null}
      {shifts === undefined ? <LoadingCards /> : null}
      {shifts === null ? (
        <>
          <Notice tone="error" title={t('duty.loadFailed')}>
            {t('common.networkError')}
          </Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {shifts ? (
        <>
          <Section icon="time" title={t('duty.mineTitle')} description={t('duty.mineHint')}>
            {mine.length === 0 ? (
              <AppText tone="muted">{t('duty.noneMine')}</AppText>
            ) : (
              <Columns>
                {mine.map((s) => (
                  <ListRow
                    key={s.id}
                    leading="time"
                    title={dayText(t, s.onDate)}
                    details={[
                      timeLine(s),
                      // Who else is on the shift; nothing when it is only me.
                      ...(s.people.some((p) => p.id !== myId)
                        ? [t('duty.withLine', { names: s.people.filter((p) => p.id !== myId).map((p) => p.name).join(', ') })]
                        : []),
                    ]}
                    onPress={isGuru ? () => openShift(s) : undefined}
                  />
                ))}
              </Columns>
            )}
          </Section>
          <Section icon="visits" title={t('duty.rosterTitle')}>
            {days.length === 0 ? <EmptyState icon="visits" title={t('duty.empty')} /> : null}
            {days.map((day) => (
              <Columns key={day}>
                <AppText variant="label">{dayText(t, day)}</AppText>
                {shifts
                  .filter((s) => s.onDate === day)
                  .map((s) => (
                    <ListRow
                      key={s.id}
                      leading="groups"
                      highlighted={s.people.some((p) => p.id === myId)}
                      title={timeLine(s)}
                      details={[s.people.map((p) => p.name).join(', ')]}
                      onPress={isGuru ? () => openShift(s) : undefined}
                    />
                  ))}
              </Columns>
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
