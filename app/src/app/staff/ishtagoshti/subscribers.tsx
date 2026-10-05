// I15 Ishtagoshti subscribers, the Guru only (Phase 2 slice 7, docs/DECISIONS.md #88): counts, joins per
// week (last 12 weeks), and the list of public subscribers, newest first, with a filter. A subscriber
// opens to show their details (year of birth, phone, a minor's parent and whether the parent confirmed,
// notes and ticks counted) and Block (optional reason) / Unblock. Coordinators see a "Guru only" line;
// the database refuses them anyway. Data: src/data/ig-subscribers.ts.

import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { GuruOnly } from '@/components/guru-only';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { TextField } from '@/components/text-field';
import { fetchSubscribers, setSubscriberBlocked, type Subscriber, type WeekJoins } from '@/data/ig-subscribers';
import { formatDayMonthYear, todayInIndia } from '@/lib/dates';

type Filter = 'all' | 'reading' | 'parent' | 'blocked';

/** Where a subscriber stands, as the list shows it. */
function stateOf(s: Subscriber): Exclude<Filter, 'all'> | 'inClass' {
  if (s.inClass) return 'inClass';
  if (s.blockedAt) return 'blocked';
  if (s.minor && !s.parentConfirmedAt) return 'parent';
  return 'reading';
}

/** I15 for the Guru. */
export default function IshtagoshtiSubscribersScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  // undefined = loading, null = could not load.
  const [data, setData] = useState<{ subscribers: Subscriber[]; weeks: WeekJoins[] } | null | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const isGuru = profile?.role === 'guru';

  const load = useCallback(async () => {
    if (isGuru) setData(await fetchSubscribers());
  }, [isGuru]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!isGuru) return <GuruOnly title={t('igSubscribers.title')} />;

  const list = data?.subscribers ?? [];
  const shown = list.filter((s) => filter === 'all' || stateOf(s) === filter);
  const thisWeek = data?.weeks.at(-1)?.joins ?? 0;
  const most = Math.max(1, ...(data?.weeks.map((w) => w.joins) ?? [1]));
  const thisYear = Number(todayInIndia().slice(0, 4));

  return (
    <Screen underHeader wide onRefresh={load}>
      <Stack.Screen options={{ title: t('igSubscribers.title') }} />
      <AppText tone="muted">{t('igSubscribers.intro')}</AppText>
      {data === undefined ? <LoadingCards /> : null}
      {data === null ? (
        <>
          <Notice tone="error" title={t('igSubscribers.loadFailed')}>{t('common.networkError')}</Notice>
          <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
        </>
      ) : null}
      {data ? (
        <>
          <StatGrid>
            <StatTile icon="ishtagoshti" value={String(list.filter((s) => stateOf(s) === 'reading').length)} label={t('igSubscribers.reading')} onPress={() => setFilter('reading')} />
            <StatTile icon="guardian" value={String(list.filter((s) => stateOf(s) === 'parent').length)} label={t('igSubscribers.waitingParent')} onPress={() => setFilter('parent')} />
            <StatTile icon="cancel" value={String(list.filter((s) => stateOf(s) === 'blocked').length)} label={t('igSubscribers.blocked')} onPress={() => setFilter('blocked')} />
            <StatTile icon="newJoiner" value={String(thisWeek)} label={t('igSubscribers.thisWeek')} />
          </StatGrid>

          <Section icon="report" title={t('igSubscribers.weeksTitle')} description={t('igSubscribers.weeksHint')}>
            {data.weeks.map((w) => (
              <ProgressBar
                key={w.weekStart}
                done={w.joins}
                total={most}
                label={t('igSubscribers.weeksTitle')}
                valueText={`${t('igSubscribers.weekOf', { date: formatDayMonthYear(w.weekStart) })}: ${w.joins}`}
                showComplete={false}
              />
            ))}
          </Section>

          <ChoiceGroup<Filter>
            chips
            label={t('igSubscribers.show')}
            value={filter}
            onChange={setFilter}
            choices={[
              { value: 'all', label: t('igSubscribers.filterAll', { count: list.length }) },
              { value: 'reading', label: t('igSubscribers.reading') },
              { value: 'parent', label: t('igSubscribers.waitingParent') },
              { value: 'blocked', label: t('igSubscribers.blocked') },
            ]}
          />
          {shown.length === 0 ? <EmptyState icon="groups" title={t('igSubscribers.none')} /> : null}
          {shown.map((s) =>
            open === s.profileId ? (
              <SubscriberCard key={s.profileId} subscriber={s} thisYear={thisYear} onClose={() => setOpen(null)} onChanged={load} />
            ) : (
              <ListRow
                key={s.profileId}
                leading="initials"
                title={s.fullName || s.email || '?'}
                details={[
                  s.email ?? '',
                  t(`igSubscribers.state_${stateOf(s)}`),
                  t('igSubscribers.joinedOn', { date: formatDayMonthYear(s.joinedAt.slice(0, 10)) }),
                ].filter(Boolean)}
                warning={stateOf(s) === 'blocked' ? t('igSubscribers.blocked') : undefined}
                onPress={() => setOpen(s.profileId)}
              />
            ),
          )}
        </>
      ) : null}
    </Screen>
  );
}

/** One subscriber opened: details and Block / Unblock. */
function SubscriberCard({
  subscriber: s,
  thisYear,
  onClose,
  onChanged,
}: {
  subscriber: Subscriber;
  thisYear: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ParseKeys | null>(null);

  async function setBlocked(blocked: boolean) {
    setBusy(true);
    const problem = await setSubscriberBlocked(s.profileId, blocked, reason);
    setBusy(false);
    if (problem) setError(problem);
    else {
      setReason('');
      await onChanged();
    }
  }

  const lines = [
    s.email ? t('igSubscribers.email', { email: s.email }) : '',
    s.birthYear ? t('igSubscribers.born', { year: s.birthYear, age: thisYear - s.birthYear }) : '',
    s.phone ? t('igSubscribers.phone', { phone: s.phone }) : t('igSubscribers.noPhone'),
    t('igSubscribers.joinedOn', { date: formatDayMonthYear(s.joinedAt.slice(0, 10)) }),
    s.minor
      ? s.parentName
        ? t(s.parentConfirmedAt ? 'igSubscribers.parentConfirmed' : 'igSubscribers.parentWaiting', {
            name: s.parentName,
            relation: s.parentRelation ?? '',
            email: s.parentEmail ?? '',
          })
        : ''
      : t('igSubscribers.adult'),
    t('igSubscribers.activity', { memorised: s.memorised, notes: s.notes }),
    s.inClass ? t('igSubscribers.state_inClass') : '',
    s.blockedAt ? t('igSubscribers.blockedOn', { date: formatDayMonthYear(s.blockedAt.slice(0, 10)), reason: s.blockReason ?? '—' }) : '',
  ].filter(Boolean);

  return (
    <Section icon="person" title={s.fullName || s.email || '?'} description={t(`igSubscribers.state_${stateOf(s)}`)}>
      {lines.map((line) => (
        <AppText key={line}>{line}</AppText>
      ))}
      {error ? <Notice tone="error">{t(error)}</Notice> : null}
      {s.blockedAt ? (
        <Button icon="restore" label={t('igSubscribers.unblock')} onPress={() => void setBlocked(false)} loading={busy} />
      ) : (
        <>
          <TextField label={t('igSubscribers.reason')} hint={t('igSubscribers.reasonHint')} value={reason} onChangeText={setReason} maxLength={200} />
          <Button icon="cancel" label={t('igSubscribers.block')} onPress={() => void setBlocked(true)} loading={busy} />
        </>
      )}
      <Button variant="link" label={t('igSubscribers.close')} onPress={onClose} />
    </Section>
  );
}
