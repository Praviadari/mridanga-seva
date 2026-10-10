// Events and polls (S11 + S12 for students, C16 + C17 for staff): the Events circle of the home's
// ring opens this. Two tabs: Events (upcoming soonest first, then the last 60 days) and Polls (open
// ones, then closed). Each row shows when, where or the closing time, and the person's own answer;
// staff see the counts and have "New event" / "New poll". `?tab=polls` opens the second tab.
// Routes: student/events/index.tsx, staff/events/index.tsx. Data: src/data/events.ts, polls.ts.

import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/button';
import { ChoiceGroup } from '@/components/choice-group';
import { Columns } from '@/components/columns';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchEvents, placeText, whenText, type EventItem, type EventList } from '@/data/events';
import { fetchPolls, type PollItem, type PollList } from '@/data/polls';
import { formatDateTime } from '@/lib/dates';

type Tab = 'events' | 'polls';

/** The list screen. */
export function EventsHomeScreen({ area }: { area: 'student' | 'staff' }) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'polls' ? 'polls' : 'events');
  const [events, setEvents] = useState<EventList | null | undefined>(undefined);
  const [polls, setPolls] = useState<PollList | null | undefined>(undefined);
  // When the lists were loaded: an event that has started since then still reads as open.
  const [loadedAt, setLoadedAt] = useState(0);
  const isStaff = area === 'staff';

  const load = useCallback(async () => {
    const [e, p] = await Promise.all([fetchEvents(), fetchPolls()]);
    setEvents(e);
    setPolls(p);
    setLoadedAt(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t('events.homeTitle') }} />;
  const toVote = polls ? polls.open.filter((p) => p.state.canVote && p.state.myChoice === null).length : 0;

  const eventRow = ({ event: e, counts }: EventItem, list: EventList) => {
    const details = [whenText(e)];
    const where = placeText(e, list.names);
    if (where) details.push(where);
    if (e.cancelledAt) details.push(t('events.cancelled'));
    else if (isStaff) details.push(t('events.list.counts', { going: counts.going, maybe: counts.maybe, notGoing: counts.notGoing }));
    if (counts.myPart) details.push(t('events.detail.yourPart', { part: counts.myPart }));
    if (counts.myResponse) details.push(t('events.list.myAnswer', { answer: t(`events.responses.${counts.myResponse}`) }));
    else if (counts.canAnswer && !e.cancelledAt && Date.parse(e.startsAt) > loadedAt) details.push(t('events.list.pleaseAnswer'));
    return (
      <ListRow
        key={e.id}
        leading={e.cancelledAt ? 'cancel' : 'events'}
        title={e.title}
        details={details}
        highlighted={counts.myResponse === 'going'}
        onPress={() =>
          isStaff
            ? router.push({ pathname: '/staff/events/[id]', params: { id: String(e.id) } })
            : router.push({ pathname: '/student/events/[id]', params: { id: String(e.id) } })
        }
      />
    );
  };

  const pollRow = ({ poll: p, state }: PollItem) => {
    const details = [
      state.closed ? t('polls.closedOn', { date: formatDateTime(p.closedAt ?? p.closesAt) }) : t('polls.closes', { date: formatDateTime(p.closesAt) }),
    ];
    if (isStaff) details.push(t('polls.votedCount', { voted: state.voted, addressed: state.addressed }));
    if (state.myChoice !== null) details.push(t('polls.myVote', { answer: p.options[state.myChoice] ?? '' }));
    else if (state.canVote && !state.closed) details.push(t('polls.pleaseVote'));
    if (p.anonymous) details.push(t('polls.anonymous'));
    return (
      <ListRow
        key={p.id}
        leading="poll"
        title={p.question}
        details={details}
        highlighted={state.canVote && !state.closed && state.myChoice === null}
        onPress={() =>
          isStaff
            ? router.push({ pathname: '/staff/polls/[id]', params: { id: String(p.id) } })
            : router.push({ pathname: '/student/polls/[id]', params: { id: String(p.id) } })
        }
      />
    );
  };

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <ChoiceGroup
        accessibilityLabel={t('choiceNames.eventsOrPolls')}
        choices={[
          { value: 'events', label: t('events.title'), icon: 'events' },
          { value: 'polls', label: toVote > 0 ? t('polls.tabToVote', { n: toVote }) : t('polls.title'), icon: 'poll' },
        ]}
        chips
        value={tab}
        onChange={setTab}
      />

      {tab === 'events' ? (
        <>
          {isStaff ? <Button icon="add" label={t('events.create')} onPress={() => router.push('/staff/events/new')} /> : null}
          {events === undefined ? <LoadingCards /> : null}
          {events === null ? (
            <>
              <Notice tone="error" title={t('events.loadFailed')}>
                {t('common.networkError')}
              </Notice>
              <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
            </>
          ) : null}
          {events ? (
            <>
              {events.upcoming.length === 0 ? (
                <EmptyState icon="events" title={t('events.list.none')} body={isStaff ? undefined : t('events.list.noneBody')} />
              ) : (
                <Section icon="events" title={t('events.list.upcoming')}>
                  <Columns>{events.upcoming.map((i) => eventRow(i, events))}</Columns>
                </Section>
              )}
              {events.past.length > 0 ? (
                <Section icon="time" title={t('events.list.past')}>
                  <Columns>{events.past.map((i) => eventRow(i, events))}</Columns>
                </Section>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <>
          {isStaff ? <Button icon="add" label={t('polls.create')} onPress={() => router.push('/staff/polls/new')} /> : null}
          {polls === undefined ? <LoadingCards /> : null}
          {polls === null ? (
            <>
              <Notice tone="error" title={t('polls.loadFailed')}>
                {t('common.networkError')}
              </Notice>
              <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
            </>
          ) : null}
          {polls ? (
            <>
              {polls.open.length === 0 ? (
                <EmptyState icon="poll" title={t('polls.none')} />
              ) : (
                <Section icon="poll" title={t('polls.open')}>
                  <Columns>{polls.open.map(pollRow)}</Columns>
                </Section>
              )}
              {polls.closed.length > 0 ? (
                <Section icon="time" title={t('polls.closedList')}>
                  <Columns>{polls.closed.map(pollRow)}</Columns>
                </Section>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
