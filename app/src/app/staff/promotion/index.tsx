// G7 Level-up queue (Guru) and the coordinators' Promotions list (Phase 2, slice 2). Guru: the
// nominations waiting for a decision (enough coordinators answered), those still collecting
// answers, the students who meet every criterion and could be nominated, and the last decisions.
// Coordinator: the nominations waiting for their answer (C23), their own students ready to
// nominate (C22), the other open nominations and the last decisions. A nomination opens [id].tsx;
// a ready student opens nominate/[id].tsx. Data: src/data/promotion.ts (docs/DECISIONS.md #45).

import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ListRow } from '@/components/list-row';
import { LoadingCards } from '@/components/loading-cards';
import { Notice } from '@/components/notice';
import { nominationDetails } from '@/components/promotion-parts';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { fetchPromotionList, hasEnoughAnswers, type NominationItem, type PromotionList } from '@/data/promotion';
import { levelName } from '@/i18n/labels';

/** The list of nominations and ready students. */
export default function PromotionListScreen() {
  const { t } = useTranslation();
  const { area, profile } = useAuth();
  const isGuru = area === 'guru';
  const myId = profile?.id ?? '';
  // undefined = loading, null = could not load.
  const [list, setList] = useState<PromotionList | null | undefined>(undefined);

  const load = useCallback(async () => {
    setList(await fetchPromotionList(myId));
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = <Stack.Screen options={{ title: t(isGuru ? 'promotion.queueTitle' : 'promotion.listTitle') }} />;

  if (!list) {
    return (
      <Screen underHeader centred>
        {header}
        {list === undefined ? <LoadingCards /> : null}
        {list === null ? (
          <>
            <Notice tone="error" title={t('promotion.loadFailed')}>
              {t('common.networkError')}
            </Notice>
            <Button icon="refresh" label={t('common.tryAgain')} onPress={() => void load()} />
          </>
        ) : null}
      </Screen>
    );
  }

  const open = (item: NominationItem) => router.push({ pathname: '/staff/promotion/[id]', params: { id: String(item.id) } });
  const row = (item: NominationItem, highlighted = false) => (
    <ListRow
      key={item.id}
      leading="initials"
      title={item.fullName}
      highlighted={highlighted}
      details={nominationDetails(t, item)}
      onPress={() => open(item)}
    />
  );

  const toDecide = list.open.filter(hasEnoughAnswers);
  const collecting = list.open.filter((item) => !hasEnoughAnswers(item));
  const toAnswer = list.open.filter((item) => !list.answeredByMe.has(item.id));
  const answered = list.open.filter((item) => list.answeredByMe.has(item.id));

  const readySection = (
    <Section
      icon="students"
      title={t(isGuru ? 'promotion.list.readyAll' : 'promotion.list.readyMine', { count: list.ready.length })}
      description={t('promotion.list.readyHint')}>
      {list.ready.length === 0 ? <AppText tone="muted">{t('promotion.list.readyNone')}</AppText> : null}
      {list.ready.map((s) => (
        <ListRow
          key={s.studentId}
          leading="initials"
          title={s.fullName}
          details={[[s.rollNo, levelName(t, s.levelId)].join(' · ')]}
          action={{
            label: t('promotion.list.nominate'),
            variant: 'secondary',
            onPress: () => router.push({ pathname: '/staff/promotion/nominate/[id]', params: { id: s.studentId } }),
          }}
        />
      ))}
    </Section>
  );

  return (
    <Screen underHeader wide onRefresh={load}>
      {header}
      <AppText tone="muted">{t(isGuru ? 'promotion.list.introGuru' : 'promotion.list.introCoordinator')}</AppText>

      {isGuru ? (
        <>
          <Section icon="promote" title={t('promotion.list.toDecide', { count: toDecide.length })}>
            {toDecide.length === 0 ? <EmptyState icon="check" title={t('promotion.list.toDecideNone')} /> : null}
            {toDecide.map((item) => row(item, true))}
          </Section>
          <Section
            icon="feedback"
            title={t('promotion.list.collecting', { count: collecting.length })}
            description={t('promotion.list.collectingHint')}>
            {collecting.length === 0 ? <AppText tone="muted">{t('promotion.list.none')}</AppText> : null}
            {collecting.map((item) => row(item))}
          </Section>
          {readySection}
        </>
      ) : (
        <>
          <Section icon="feedback" title={t('promotion.list.toAnswer', { count: toAnswer.length })} description={t('promotion.list.toAnswerHint')}>
            {toAnswer.length === 0 ? <EmptyState icon="check" title={t('promotion.list.toAnswerNone')} /> : null}
            {toAnswer.map((item) => row(item, true))}
          </Section>
          {readySection}
          {answered.length > 0 ? (
            <Section icon="promote" title={t('promotion.list.answered', { count: answered.length })}>
              {answered.map((item) => row(item))}
            </Section>
          ) : null}
        </>
      )}

      {list.decided.length > 0 ? (
        <Section icon="level" title={t('promotion.list.decided')}>
          {list.decided.map((item) => row(item))}
        </Section>
      ) : null}
    </Screen>
  );
}
